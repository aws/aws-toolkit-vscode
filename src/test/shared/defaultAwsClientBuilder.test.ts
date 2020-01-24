/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Service } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { version } from 'vscode'
import { DefaultAWSClientBuilder } from '../../shared/awsClientBuilder'
import { FakeAwsContext } from '../utilities/fakeAwsContext'

describe('DefaultAwsClientBuilder', () => {
    describe('createAndConfigureSdkClient', () => {
        class FakeService extends Service {
            public constructor(config?: ServiceConfigurationOptions) {
                super(config)
            }
        }

        it('includes custom user-agent if no options are specified', async () => {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureServiceClient(opts => new FakeService(opts))

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.strictEqual(
                service.config.customUserAgent!,
                `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version}`
            )
        })

        it('includes custom user-agent if not specified in options', async () => {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureServiceClient(opts => new FakeService(opts), {})

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.notStrictEqual(service.config.customUserAgent, undefined)
        })

        it('does not override custom user-agent if specified in options', async () => {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureServiceClient(opts => new FakeService(opts), {
                customUserAgent: 'CUSTOM USER AGENT'
            })

            assert.strictEqual(service.config.customUserAgent, 'CUSTOM USER AGENT')
        })
    })
})
