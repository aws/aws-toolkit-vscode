/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AWSError, Request, Service } from 'aws-sdk'
import { version } from 'vscode'
import { AWSClientBuilder, DefaultAWSClientBuilder } from '../../shared/awsClientBuilder'
import { DevSettings } from '../../shared/settings'
import { getClientId } from '../../shared/telemetry/util'
import { FakeMemento } from '../fakeExtensionContext'
import { FakeAwsContext } from '../utilities/fakeAwsContext'
import { TestSettings } from '../utilities/testSettingsConfiguration'

describe('DefaultAwsClientBuilder', function () {
    let builder: AWSClientBuilder

    beforeEach(function () {
        builder = new DefaultAWSClientBuilder(new FakeAwsContext())
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
                } as any,
                undefined,
                undefined,
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
                } as any,
                undefined,
                undefined,
                new DevSettings(settings)
            )

            assert.strictEqual(service.config.endpoint, 'http://example.com')
        })

        describe('request listeners', function () {
            type WithConfig = Parameters<(typeof builder)['createAwsService']>[1] & { apiConfig: Record<string, any> }

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
