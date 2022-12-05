/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSError, Request, Service } from 'aws-sdk'
import { Token } from 'aws-sdk/lib/token'
import { version } from 'vscode'
import { Auth, isIamConnection } from '../../credentials/auth'
import { SdkCredentialsProvider } from '../../credentials/sdkV2Compat'
import { AWSClientBuilder } from '../../shared/awsClientBuilder'
import { DevSettings } from '../../shared/settings'
import { getClientId } from '../../shared/telemetry/util'
import { FakeMemento } from '../fakeExtensionContext'
import { createTestAuth } from '../testUtil'
import { TestSettings } from '../utilities/testSettingsConfiguration'

describe('AwsClientBuilder', function () {
    let auth: Auth
    let builder: AWSClientBuilder

    beforeEach(async function () {
        auth = await createTestAuth()
        builder = new AWSClientBuilder(auth)
    })

    describe('createAndConfigureSdkClient', function () {
        it('includes Toolkit user-agent if no options are specified', async function () {
            const service = await builder.createAwsService(Service)
            const clientId = await getClientId(new FakeMemento())

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.strictEqual(
                service.config.customUserAgent!.replace('---Insiders', ''),
                `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version} ClientId/${clientId}`
            )
        })

        it('adds Client-Id to user agent', async function () {
            const service = await builder.createAwsService(Service)
            const clientId = await getClientId(new FakeMemento())
            const regex = new RegExp(`ClientId/${clientId}`)
            assert.ok(service.config.customUserAgent?.match(regex))
        })

        it('does not override custom user-agent if specified in options', async function () {
            const service = await builder.createAwsService(Service, {
                customUserAgent: 'CUSTOM USER AGENT',
            })

            assert.strictEqual(service.config.customUserAgent, 'CUSTOM USER AGENT')
        })

        it('can use endpoint override', async function () {
            const settings = new TestSettings()
            await settings.update('aws.dev.endpoints', { foo: 'http://example.com' })

            const service = await builder.createAwsService(
                Service,
                {
                    customUserAgent: 'CUSTOM USER AGENT',
                    apiConfig: { metadata: { serviceId: 'foo' } },
                },
                new DevSettings(settings)
            )

            assert.strictEqual(service.config.endpoint, 'http://example.com')
        })

        it('does not clobber endpoint setting if no override is present', async function () {
            const settings = new TestSettings()

            const service = await builder.createAwsService(
                Service,
                {
                    customUserAgent: 'CUSTOM USER AGENT',
                    apiConfig: { metadata: { serviceId: 'foo' } },
                    endpoint: 'http://example.com',
                },
                new DevSettings(settings)
            )

            assert.strictEqual(service.config.endpoint, 'http://example.com')
        })

        it('uses IAM connections to produce credentials', async function () {
            assert.ok(isIamConnection(auth.activeConnection))
            const expected = await auth.activeConnection.getCredentials()
            const service = await builder.createAwsService(Service)
            assert.ok(service.config.credentials instanceof SdkCredentialsProvider)

            await service.config.credentials.getPromise()
            assert.strictEqual(service.config.credentials.accessKeyId, expected.accessKeyId)
        })

        it('uses the region of the current connection if not provided', async function () {
            const service = await builder.createAwsService(Service)

            assert.strictEqual(service.config.region, auth.activeConnection?.defaultRegion)
        })

        it('does not use the default region if an explicit region is used', async function () {
            const service = await builder.createAwsService(Service, { region: 'bar' })

            assert.strictEqual(service.config.region, 'bar')
        })

        it('does not use the current auth connection if credentials are provided', async function () {
            const credentials = { accessKeyId: 'foo', secretAccessKey: 'bar' }
            const service = await builder.createAwsService(Service, { credentials })

            assert.strictEqual(service.config.credentials?.accessKeyId, 'foo')
        })

        it('does not use the current auth connection if a token is provided', async function () {
            this.skip()

            const token = new Token({ token: 'foo' })
            const service = await builder.createAwsService(Service, { token })

            assert.strictEqual(service.config.token?.token, 'foo')
        })

        it('rejects if no auth mechanism is available', async function () {
            await auth.logout()
            await assert.rejects(() => builder.createAwsService(Service))
        })

        describe('request listeners', function () {
            type WithConfig = Parameters<typeof builder['createAwsService']>[1] & { apiConfig: Record<string, any> }

            it('calls listener with correct type', async function () {
                const service = await builder.createAwsService(Service, {
                    apiConfig: { operations: { FakeOperation: {} } },
                    onRequestSetup: [
                        request => {
                            assert.ok(request.service instanceof Service)
                            assert.strictEqual(request.operation, 'FakeOperation')
                            assert.deepStrictEqual(request.params, { foo: 'bar' })

                            request.on(
                                'validate',
                                () => {
                                    throw new Error()
                                },
                                true
                            )
                        },
                    ],
                } as WithConfig)

                const request = service.makeRequest('FakeOperation', { foo: 'bar' }).promise()
                await assert.rejects(request)
            })

            it('can add listeners without affecting the original class', async function () {
                let callCount = 0

                const getDescriptors = (ctor: new (...args: any[]) => any) =>
                    Object.getOwnPropertyDescriptors(ctor.prototype)

                const base = class extends Service {
                    public override setupRequestListeners(request: Request<any, AWSError>): void {
                        callCount += 1
                    }
                }

                // Pretty gross but we're dealing with old school JS inheritance here
                function factory(...args: any[]) {
                    const instance = new Service(...args)
                    const proto = Object.create(Object.getPrototypeOf(instance), getDescriptors(base))
                    Object.setPrototypeOf(instance, proto)

                    return instance
                }
                const ctor = factory as unknown as typeof base

                const expected = getDescriptors(ctor)
                const service = await builder.createAwsService(ctor, {
                    apiConfig: { operations: { Foo: {} } },
                    onRequestSetup: () => {},
                } as WithConfig)

                assert.deepStrictEqual(getDescriptors(ctor), expected)
                assert.ok(service instanceof Service)

                // This is just a reference compare. Unbound methods don't matter here.
                // eslint-disable-next-line @typescript-eslint/unbound-method
                assert.notStrictEqual(service.setupRequestListeners, base.prototype.setupRequestListeners)

                await assert.rejects(service.makeRequest('Foo').promise())
                assert.strictEqual(callCount, 1)
            })
        })
    })
})
