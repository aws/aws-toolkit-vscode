/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon'
import assert from 'assert'
import { version } from 'vscode'
import { getClientId } from '../../shared/telemetry/util'
import { FakeMemento } from '../fakeExtensionContext'
import { FakeAwsContext } from '../utilities/fakeAwsContext'
import { GlobalState } from '../../shared/globalState'
import {
    AWSClientBuilderV3,
    emitOnRequest,
    getServiceId,
    logOnRequest,
    overwriteEndpoint,
    recordErrorTelemetry,
} from '../../shared/awsClientBuilderV3'
import { Client } from '@aws-sdk/smithy-client'
import { DevSettings, extensionVersion } from '../../shared'
import { assertTelemetry } from '../testUtil'
import { telemetry } from '../../shared/telemetry'
import { HttpRequest, HttpResponse } from '@aws-sdk/protocol-http'
import { assertLogsContain, assertLogsContainAllOf } from '../globalSetup.test'
import { TestSettings } from '../utilities/testSettingsConfiguration'
import { CredentialsShim } from '../../auth/deprecated/loginManager'
import { Credentials } from '@aws-sdk/types'
import { oneDay } from '../../shared/datetime'

describe('AwsClientBuilderV3', function () {
    let builder: AWSClientBuilderV3

    beforeEach(async function () {
        builder = new AWSClientBuilderV3(new FakeAwsContext())
    })

    it('includes Toolkit user-agent if no options are specified', async function () {
        const service = await builder.createAwsService(Client)
        const clientId = getClientId(new GlobalState(new FakeMemento()))

        assert.ok(service.config.userAgent)
        assert.strictEqual(
            service.config.userAgent![0][0].replace('---Insiders', ''),
            `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version} ClientId/${clientId}`
        )
        assert.strictEqual(service.config.userAgent![0][1], extensionVersion)
    })

    it('adds region to client', async function () {
        const service = await builder.createAwsService(Client, { region: 'us-west-2' })

        assert.ok(service.config.region)
        assert.strictEqual(service.config.region, 'us-west-2')
    })

    it('adds Client-Id to user agent', async function () {
        const service = await builder.createAwsService(Client)
        const clientId = getClientId(new GlobalState(new FakeMemento()))
        const regex = new RegExp(`ClientId/${clientId}`)
        assert.ok(service.config.userAgent![0][0].match(regex))
    })

    it('does not override custom user-agent if specified in options', async function () {
        const service = await builder.createAwsService(Client, {
            userAgent: [['CUSTOM USER AGENT']],
        })

        assert.strictEqual(service.config.userAgent[0][0], 'CUSTOM USER AGENT')
    })

    describe('middlewareStack', function () {
        let args: { request: { hostname: string; path: string }; input: any }
        let context: { clientName?: string; commandName?: string }
        let response: { response: { statusCode: number }; output: { message: string } }
        let httpRequestStub: sinon.SinonStub
        let httpResponseStub: sinon.SinonStub

        before(function () {
            httpRequestStub = sinon.stub(HttpRequest, 'isInstance')
            httpResponseStub = sinon.stub(HttpResponse, 'isInstance')
            httpRequestStub.callsFake(() => true)
            httpResponseStub.callsFake(() => true)
        })

        beforeEach(function () {
            args = {
                request: {
                    hostname: 'testHost',
                    path: 'testPath',
                },
                input: {
                    testKey: 'testValue',
                },
            }
            context = {
                clientName: 'fooClient',
            }
            response = {
                response: {
                    statusCode: 200,
                },
                output: {
                    message: 'test output',
                },
            }
        })
        after(function () {
            sinon.restore()
        })

        it('logs messages on request', async function () {
            await logOnRequest((_: any) => _, args as any)
            assertLogsContainAllOf(['testHost', 'testPath'], false, 'debug')
        })

        it('adds telemetry metadata and logs on error failure', async function () {
            const next = (_: any) => {
                throw new Error('test error')
            }
            await telemetry.vscode_executeCommand.run(async (span) => {
                await assert.rejects(emitOnRequest(next, context, args))
            })
            assertLogsContain('test error', false, 'error')
            assertTelemetry('vscode_executeCommand', { requestServiceType: 'foo' })
        })

        it('does not emit telemetry, but still logs on successes', async function () {
            const next = async (_: any) => {
                return response
            }
            await telemetry.vscode_executeCommand.run(async (span) => {
                assert.deepStrictEqual(await emitOnRequest(next, context, args), response)
            })
            assertLogsContainAllOf(['testHost', 'testPath'], false, 'debug')
            assert.throws(() => assertTelemetry('vscode_executeCommand', { requestServiceType: 'foo' }))
        })

        it('custom endpoints overwrite request url', async function () {
            const settings = new TestSettings()
            await settings.update('aws.dev.endpoints', { foo: 'http://example.com:3000/path' })
            const next = async (args: any) => args
            const newArgs: any = await overwriteEndpoint(next, context, new DevSettings(settings), args)

            assert.strictEqual(newArgs.request.hostname, 'example.com')
            assert.strictEqual(newArgs.request.protocol, 'http:')
            assert.strictEqual(newArgs.request.port, '3000')
            assert.strictEqual(newArgs.request.pathname, '/path')
        })

        it('custom endpoints are not overwritten if not specified', async function () {
            const settings = new TestSettings()
            const next = async (args: any) => args
            const newArgs: any = await overwriteEndpoint(next, context, new DevSettings(settings), args)

            assert.strictEqual(newArgs.request.hostname, 'testHost')
            assert.strictEqual(newArgs.request.path, 'testPath')
        })
    })

    describe('clientCredentials', function () {
        let fakeContext: FakeAwsContext
        let mockCredsShim: MockCredentialsShim
        let oldCreds: Credentials
        let newCreds: Credentials

        beforeEach(function () {
            fakeContext = new FakeAwsContext()
            oldCreds = {
                accessKeyId: 'old',
                secretAccessKey: 'old',
                sessionToken: 'old',
                expiration: new Date(Date.now() + oneDay),
            }
            newCreds = {
                accessKeyId: 'new',
                secretAccessKey: 'new',
                sessionToken: 'new',
                expiration: new Date(Date.now() + oneDay),
            }
            mockCredsShim = new MockCredentialsShim(oldCreds, newCreds)
            fakeContext.credentialsShim = mockCredsShim
            builder = new AWSClientBuilderV3(fakeContext)
        })

        it('refreshes credentials when they expire', async function () {
            const service = await builder.createAwsService(Client)
            assert.strictEqual(await service.config.credentials(), oldCreds)
            mockCredsShim.expire()
            assert.strictEqual(await service.config.credentials(), newCreds)
        })

        it('does not cache stale credentials', async function () {
            const service = await builder.createAwsService(Client)
            assert.strictEqual(await service.config.credentials(), oldCreds)
            const newerCreds = {
                accessKeyId: 'old2',
                secretAccessKey: 'old2',
                sessionToken: 'old2',
                expiration: new Date(Date.now() + oneDay),
            }
            mockCredsShim.update(newerCreds)
            assert.strictEqual(await service.config.credentials(), newerCreds)
        })
    })
})

describe('getServiceId', function () {
    it('returns the service ID', function () {
        assert.strictEqual(getServiceId({ clientName: 'ec2' }), 'ec2')
        assert.strictEqual(getServiceId({ clientName: 'ec2client' }), 'ec2')
        assert.strictEqual(getServiceId({ clientName: 's3client' }), 's3')
    })
})

describe('recordErrorTelemetry', function () {
    it('includes requestServiceType in span', function () {
        const e = new Error('test error')
        // Using vscode_executeCommand as general span to test functionality. This metric is unrelated to what is done here.
        telemetry.vscode_executeCommand.run((span) => {
            recordErrorTelemetry(e, 'aws-service')
        })
        assertTelemetry('vscode_executeCommand', { requestServiceType: 'aws-service' })
    })
})

class MockCredentialsShim implements CredentialsShim {
    public constructor(
        public credentials: Credentials,
        public readonly refreshedCredentials: Credentials
    ) {}

    public expire(): void {
        this.credentials = {
            ...this.credentials,
            expiration: new Date(Date.now() - oneDay),
        }
    }

    public update(newCreds: Credentials): void {
        this.credentials = newCreds
    }

    public async get(): Promise<Credentials> {
        return this.credentials
    }

    public async refresh(): Promise<Credentials> {
        return this.refreshedCredentials
    }
}
