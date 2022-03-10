/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSError, Request, Service } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { version } from 'vscode'
import { AWSClientBuilder, DefaultAWSClientBuilder } from '../../shared/awsClientBuilder'
import { FakeAwsContext } from '../utilities/fakeAwsContext'

describe('DefaultAwsClientBuilder', function () {
    let builder: AWSClientBuilder

    beforeEach(function () {
        builder = new DefaultAWSClientBuilder(new FakeAwsContext())
    })

    describe('createAndConfigureSdkClient', function () {
        class FakeService extends Service {
            public constructor(config?: ServiceConfigurationOptions) {
                super(config)
            }
        }

        it('includes Toolkit user-agent if no options are specified', async function () {
            const service = await builder.createAwsService(FakeService)

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.strictEqual(
                service.config.customUserAgent!.replace('---Insiders', ''),
                `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version}`
            )
        })

        it('does not override custom user-agent if specified in options', async function () {
            const service = await builder.createAwsService(FakeService, {
                customUserAgent: 'CUSTOM USER AGENT',
            })

            assert.strictEqual(service.config.customUserAgent, 'CUSTOM USER AGENT')
        })

        describe('request listeners', function () {
            it('calls listener with correct type', async function () {
                let errorCount = 0

                const service = await builder.createAwsService(FakeService, {
                    onRequest: [
                        request => {
                            const serviceName = request.service.constructor.name

                            assert.strictEqual(serviceName, 'FakeService')
                            assert.strictEqual(request.operation, 'FakeOperation')
                            assert.deepStrictEqual(request.params, { foo: 'bar' })

                            request.on('error', e => (errorCount += !e.originalError ? 1 : 0))
                        },
                    ],
                })

                async function assertRequest() {
                    const request = service.makeRequest('FakeOperation', { foo: 'bar' }).promise()
                    await assert.rejects(request, /Missing region in config/)
                }

                await assertRequest()
                assert.strictEqual(errorCount, 1)

                await assertRequest()
                assert.strictEqual(errorCount, 2)
            })

            it('can add listeners without affecting the original class', async function () {
                let callCount = 0

                const getDescriptors = (ctor: new (...args: any[]) => any) =>
                    Object.getOwnPropertyDescriptors(Object.getPrototypeOf(ctor))

                const Original = class extends Service {
                    public override setupRequestListeners(request: Request<any, AWSError>): void {
                        callCount += 1
                    }
                }

                const expected = getDescriptors(Original)
                const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
                const service = await builder.createAwsService(Original, { onRequest: () => {} })

                assert.deepStrictEqual(getDescriptors(Original), expected)
                assert.ok(service instanceof Original)

                // This is just a reference compare. Unbound methods don't matter here.
                // eslint-disable-next-line @typescript-eslint/unbound-method
                assert.notStrictEqual(service.setupRequestListeners, Original.prototype.setupRequestListeners)

                await assert.rejects(service.makeRequest('Foo').promise())
                assert.strictEqual(callCount, 1)
            })
        })
    })
})
