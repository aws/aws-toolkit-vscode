/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Service } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { DefaultAWSClientBuilder } from '../../shared/awsClientBuilder'
import { FakeAwsContext } from '../utilities/fakeAwsContext'

describe('DefaultAwsClientBuilder', () => {
    describe('createAndConfigureSdkClient', () => {
        class FakeService extends Service {
            public constructor(config?: ServiceConfigurationOptions) {
                super(config)
            }
        }

        // We don't want to test against the versions reported by package.json and vscode.version--this is
        // what the product code does, so these tests would still pass with bad versions. Instead, we
        // verify that a valid semver is used. This protects us against things like `null`, `undefined`,
        // or other unexpected values.
        const semverRegex = (require('semver-regex') as () => RegExp)()
        const userAgentRegex = new RegExp(
            `^AWS-Toolkit-For-VSCode\\/${semverRegex.source} Visual-Studio-Code\\/${semverRegex.source}`
        )

        it('includes custom user-agent if no options are specified', async () => {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureServiceClient(opts => new FakeService(opts))

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.strictEqual(userAgentRegex.test(service.config.customUserAgent!), true)
        })

        it('includes custom user-agent if not specified in options', async () => {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureServiceClient(opts => new FakeService(opts), {})

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.strictEqual(userAgentRegex.test(service.config.customUserAgent!), true)
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
