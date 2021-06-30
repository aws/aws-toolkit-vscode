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

describe('DefaultAwsClientBuilder', function () {
    describe('createAndConfigureSdkClient', function () {
        class FakeService extends Service {
            public constructor(config?: ServiceConfigurationOptions) {
                super(config)
            }
        }

        it('includes Toolkit user-agent if no options are specified', async function () {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAwsService(FakeService)

            assert.strictEqual(!!service.config.customUserAgent, true)
            assert.strictEqual(
                service.config.customUserAgent!.replace('---Insiders', ''),
                `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version}`
            )
        })

        it('does not override custom user-agent if specified in options', async function () {
            const builder = new DefaultAWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAwsService(FakeService, {
                customUserAgent: 'CUSTOM USER AGENT',
            })

            assert.strictEqual(service.config.customUserAgent, 'CUSTOM USER AGENT')
        })
    })
})
