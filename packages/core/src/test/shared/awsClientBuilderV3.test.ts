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
    AwsClient,
    AWSClientBuilderV3,
    AwsClientOptions,
    AwsCommand,
    onDeserialize,
    getServiceId,
    logOnFinalize,
    overwriteEndpoint,
    recordErrorTelemetry,
} from '../../shared/awsClientBuilderV3'
import { Client } from '@aws-sdk/smithy-client'
import { DevSettings, extensionVersion } from '../../shared'
import { assertTelemetry } from '../testUtil'
import { telemetry } from '../../shared/telemetry'
import { assertLogsContain, assertLogsContainAllOf } from '../globalSetup.test'
import { TestSettings } from '../utilities/testSettingsConfiguration'
import { CredentialsShim } from '../../auth/deprecated/loginManager'
import { Credentials, MetadataBearer, MiddlewareStack } from '@aws-sdk/types'
import { oneDay } from '../../shared/datetime'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { StandardRetryStrategy } from '@smithy/util-retry'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { HttpRequest, HttpResponse } from '@smithy/protocol-http'

describe('AwsClientBuilderV3', function () {
    let builder: AWSClientBuilderV3

    beforeEach(async function () {
        builder = new AWSClientBuilderV3(new FakeAwsContext())
    })

    it('includes Toolkit user-agent if no options are specified', function () {
        const service = builder.createAwsService({ serviceClient: Client })
        const clientId = getClientId(new GlobalState(new FakeMemento()))

        assert.ok(service.config.userAgent)
        assert.strictEqual(
            service.config.userAgent![0][0].replace('---Insiders', ''),
            `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version} ClientId/${clientId}`
        )
        assert.strictEqual(service.config.userAgent![0][1], extensionVersion)
    })

    it('adds region to client', function () {
        const service = builder.createAwsService({ serviceClient: Client, region: 'us-west-2' })

        assert.ok(service.config.region)
        assert.strictEqual(service.config.region, 'us-west-2')
    })

    it('adds Client-Id to user agent', function () {
        const service = builder.createAwsService({ serviceClient: Client })
        const clientId = getClientId(new GlobalState(new FakeMemento()))
        const regex = new RegExp(`ClientId/${clientId}`)
        assert.ok(service.config.userAgent![0][0].match(regex))
    })

    it('does not override custom user-agent if specified in options', function () {
        const service = builder.createAwsService({
            serviceClient: Client,
            clientOptions: {
                userAgent: [['CUSTOM USER AGENT']],
            },
        })

        assert.strictEqual(service.config.userAgent[0][0], 'CUSTOM USER AGENT')
    })

    it('injects http client into handler', function () {
        const requestHandler = new NodeHttpHandler({
            requestTimeout: 1234,
        })
        const service = builder.createAwsService({
            serviceClient: Client,
            clientOptions: {
                requestHandler: requestHandler,
            },
        })
        assert.strictEqual(service.config.requestHandler, requestHandler)
    })

    it('defaults to reusing singular http handler', function () {
        const service = builder.createAwsService({
            serviceClient: Client,
        })
        const service2 = builder.createAwsService({
            serviceClient: Client,
        })

        const firstHandler = service.config.requestHandler
        const secondHandler = service2.config.requestHandler

        // If not injected, the http handler can be undefined before making request.
        if (firstHandler instanceof NodeHttpHandler && secondHandler instanceof NodeHttpHandler) {
            assert.ok(firstHandler === secondHandler)
        } else {
            assert.fail('Expected both request handlers to be NodeHttpHandler instances')
        }
    })

    describe('caching mechanism', function () {
        it('avoids recreating client on duplicate calls', async function () {
            const firstClient = builder.getAwsService({ serviceClient: TestClient })
            const secondClient = builder.getAwsService({ serviceClient: TestClient })

            assert.strictEqual(firstClient.id, secondClient.id)
        })

        it('recreates client when region changes', async function () {
            const firstClient = builder.getAwsService({ serviceClient: TestClient, region: 'test-region' })
            const secondClient = builder.getAwsService({ serviceClient: TestClient, region: 'test-region2' })
            const thirdClient = builder.getAwsService({ serviceClient: TestClient, region: 'test-region' })

            assert.notStrictEqual(firstClient.id, secondClient.id)
            assert.strictEqual(firstClient.args.region, 'test-region')
            assert.strictEqual(secondClient.args.region, 'test-region2')

            assert.strictEqual(firstClient.id, thirdClient.id)
        })

        it('recreates client when the underlying service changes', async function () {
            const firstClient = builder.getAwsService({ serviceClient: TestClient })
            const secondClient = builder.getAwsService({ serviceClient: TestClient2 })
            const thirdClient = builder.getAwsService({ serviceClient: TestClient })

            assert.notStrictEqual(firstClient.type, secondClient.type)
            assert.strictEqual(firstClient.id, thirdClient.id)
        })

        it('recreates client when config options change', async function () {
            const retryStrategy = new ConfiguredRetryStrategy(10)
            const firstClient = builder.getAwsService({
                serviceClient: TestClient,
                clientOptions: {
                    retryStrategy: retryStrategy,
                },
            })

            const secondClient = builder.getAwsService({
                serviceClient: TestClient,
                clientOptions: {
                    retryStrategy: new StandardRetryStrategy(1),
                },
            })

            const thirdClient = builder.getAwsService({
                serviceClient: TestClient,
                clientOptions: {
                    retryStrategy: retryStrategy,
                },
            })

            assert.notStrictEqual(firstClient.id, secondClient.id)
            assert.strictEqual(firstClient.id, thirdClient.id)
        })

        it('recreates client when endpoints change', async function () {
            const settings = new TestSettings()
            await settings.update('aws.dev.endpoints', { foo: 'http://example.com:3000/path' })
            const devSettings = new DevSettings(settings)

            const otherSettings = new TestSettings()
            await otherSettings.update('aws.dev.endpoints', { foo: 'http://example.com:3000/path2' })
            const otherDevSettings = new DevSettings(otherSettings)

            const firstClient = builder.getAwsService({
                serviceClient: TestClient,
                region: 'test-region',
                settings: devSettings,
            })
            const secondClient = builder.getAwsService({
                serviceClient: TestClient,
                region: 'test-region',
                settings: otherDevSettings,
            })
            const thirdClient = builder.getAwsService({
                serviceClient: TestClient,
                region: 'test-region',
                settings: devSettings,
            })

            assert.notStrictEqual(firstClient.id, secondClient.id)
            assert.strictEqual(firstClient.id, thirdClient.id)
        })
    })

    describe('middlewareStack', function () {
        let args: { request: HttpRequest; input: any }
        let context: { clientName?: string; commandName?: string }
        let output: { response: HttpResponse }

        beforeEach(function () {
            args = {
                request: new HttpRequest({
                    hostname: 'testHost',
                    path: 'testPath',
                    headers: {
                        'x-amzn-RequestId': 'fakeId',
                        'x-amzn-requestid': 'realId',
                    },
                }),
                input: {},
            }
            output = {
                response: new HttpResponse({
                    statusCode: 200,
                    body: 'test body',
                    headers: {
                        'x-amzn-RequestId': 'fakeId',
                        'x-amzn-requestid': 'realId',
                    },
                }),
            }
            context = {
                clientName: 'foo',
                commandName: 'bar',
            }
        })
        after(function () {
            sinon.restore()
        })

        it('logs messages on request', async function () {
            await logOnFinalize((_: any) => _, args)
            assertLogsContainAllOf(['testHost', 'testPath'], false, 'debug')
        })

        it('adds telemetry metadata and logs on error failure', async function () {
            const next = (_: any) => {
                throw new Error('test error')
            }
            await telemetry.vscode_executeCommand.run(async (_span) => {
                await assert.rejects(onDeserialize(next, context, args))
            })
            assertLogsContain('test error', false, 'warn')
            assertTelemetry('vscode_executeCommand', { requestServiceType: 'foo' })
        })

        it('does not emit telemetry, but still logs on successes', async function () {
            const next = async (_: any) => {
                return output
            }
            await telemetry.vscode_executeCommand.run(async (_span) => {
                assert.deepStrictEqual(await onDeserialize(next, context, args), output)
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
            assert.strictEqual(newArgs.request.path, '/testPath')
        })

        it('logs specific headers in the filter list', async function () {
            const next = async (args: any) => args
            await logOnFinalize(next, args)

            assertLogsContain('realId', false, 'debug')
            assert.throws(() => assertLogsContain('fakeId', false, 'debug'))
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
            const service = builder.createAwsService({ serviceClient: Client })
            assert.strictEqual(await service.config.credentials(), oldCreds)
            mockCredsShim.expire()
            assert.strictEqual(await service.config.credentials(), newCreds)
        })

        it('does not cache stale credentials', async function () {
            const service = builder.createAwsService({ serviceClient: Client })
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

        it('does not initialize credentials if token is provided', function () {
            const service = builder.createAwsService({
                serviceClient: Client,
                clientOptions: {
                    token: { token: 'my-token', expiration: new Date(Date.now() + oneDay) },
                },
            })
            assert.ok(service.config.credentials === undefined)
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

abstract class TestClientBase implements AwsClient {
    public constructor(
        public readonly args: AwsClientOptions,
        public readonly id: number,
        public readonly type: string
    ) {}
    public middlewareStack: { add: MiddlewareStack<any, MetadataBearer>['add'] } = {
        add: (_: any, __: any) => {},
    }
    public async send(command: AwsCommand<object, object>, options?: any): Promise<any> {}
    public destroy(): void {}
}

class TestClient extends TestClientBase {
    private static nextId: number = 0
    public constructor(args: AwsClientOptions) {
        super(args, TestClient.nextId++, 'TestClient')
    }
}

class TestClient2 extends TestClientBase {
    private static nextId: number = 0
    public constructor(args: AwsClientOptions) {
        super(args, TestClient2.nextId++, 'TestClient2')
    }
}
