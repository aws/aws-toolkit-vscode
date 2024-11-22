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
    DefaultAWSClientBuilderV3,
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

describe('DefaultAwsClientBuilderV3', function () {
    let builder: AWSClientBuilderV3

    beforeEach(function () {
        builder = new DefaultAWSClientBuilderV3(new FakeAwsContext())
    })

    it('includes Toolkit user-agent if no options are specified', async function () {
        const service = await builder.createAwsService(Client as any)
        const clientId = getClientId(new GlobalState(new FakeMemento()))

        assert.ok(service.config.customUserAgent)
        assert.strictEqual(
            service.config.customUserAgent![0][0].replace('---Insiders', ''),
            `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version} ClientId/${clientId}`
        )
        assert.strictEqual(service.config.customUserAgent![0][1], extensionVersion)
    })

    it('adds region to client', async function () {
        const service = await builder.createAwsService(Client as any, { region: 'us-west-2' })

        assert.ok(service.config.region)
        assert.strictEqual(service.config.region, 'us-west-2')
    })

    it('adds Client-Id to user agent', async function () {
        const service = await builder.createAwsService(Client as any)
        const clientId = getClientId(new GlobalState(new FakeMemento()))
        const regex = new RegExp(`ClientId/${clientId}`)
        assert.ok(service.config.customUserAgent![0][0].match(regex))
    })

    it('does not override custom user-agent if specified in options', async function () {
        const service = await builder.createAwsService(Client as any, {
            customUserAgent: [['CUSTOM USER AGENT']],
        })

        assert.strictEqual(service.config.customUserAgent[0][0], 'CUSTOM USER AGENT')
    })

    describe('middlewareStack', function () {
        let args: { request: { hostname: string; path: string }; input: any }
        let context: { clientName?: string; commandName?: string }
        let response: { response: { statusCode: number }; output: { message: string } }

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
        afterEach(function () {
            sinon.restore()
        })

        it('logs messages on request', async function () {
            sinon.stub(HttpRequest, 'isInstance').callsFake(() => true)
            await logOnRequest((_: any) => _, args as any)
            assertLogsContainAllOf(['testHost', 'testPath'], false, 'debug')
        })

        it('adds telemetry meta and logs on error failure', async function () {
            sinon.stub(HttpResponse, 'isInstance').callsFake(() => true)

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
            sinon.stub(HttpResponse, 'isInstance').callsFake(() => true)
            const next = async (_: any) => {
                return response
            }
            await telemetry.vscode_executeCommand.run(async (span) => {
                assert.deepStrictEqual(await emitOnRequest(next, context, args), response)
            })
            assertLogsContainAllOf(['testHost', 'testPath'], false, 'debug')
            assert.throws(() => assertTelemetry('vscode_executeCommand', { requestServiceType: 'test' }))
        })

        it('custom endpoints overwrite request url', async function () {
            const settings = new TestSettings()
            await settings.update('aws.dev.endpoints', { foo: 'http://example.com:3000/path' })
            sinon.stub(HttpRequest, 'isInstance').callsFake(() => true)
            const next = async (args: any) => args
            const newArgs: any = await overwriteEndpoint(next, context, new DevSettings(settings), args)

            assert.strictEqual(newArgs.request.hostname, 'example.com')
            assert.strictEqual(newArgs.request.protocol, 'http:')
            assert.strictEqual(newArgs.request.port, '3000')
            assert.strictEqual(newArgs.request.pathname, '/path')
        })

        it('custom endpoints are not overwritten if not specified', async function () {
            const settings = new TestSettings()
            sinon.stub(HttpRequest, 'isInstance').callsFake(() => true)
            const next = async (args: any) => args
            const newArgs: any = await overwriteEndpoint(next, context, new DevSettings(settings), args)

            assert.strictEqual(newArgs.request.hostname, 'testHost')
            assert.strictEqual(newArgs.request.path, 'testPath')
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
