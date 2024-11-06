/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { version } from 'vscode'
import { DevSettings } from '../../shared/settings'
import { getClientId } from '../../shared/telemetry/util'
import { FakeMemento } from '../fakeExtensionContext'
import { FakeAwsContext } from '../utilities/fakeAwsContext'
import { TestSettings } from '../utilities/testSettingsConfiguration'
import { GlobalState } from '../../shared/globalState'
import { AWSClientBuilderV3, DefaultAWSClientBuilderV3 } from '../../shared/awsClientBuilderV3'
import { Client } from '@aws-sdk/smithy-client'

describe('DefaultAwsClientBuilderV3', function () {
    let builder: AWSClientBuilderV3

    beforeEach(function () {
        builder = new DefaultAWSClientBuilderV3(new FakeAwsContext())
    })

    describe('createAndConfigureSdkClient', function () {
        it('includes Toolkit user-agent if no options are specified', async function () {
            const service = await builder.createAwsService(Client)
            const clientId = getClientId(new GlobalState(new FakeMemento()))

            assert.ok(service.config.customUserAgent)
            assert.strictEqual(
                service.config.customUserAgent![0][0].replace('---Insiders', ''),
                `AWS-Toolkit-For-VSCode/testPluginVersion Visual-Studio-Code/${version} ClientId/${clientId}`
            )
        })

        it('adds Client-Id to user agent', async function () {
            const service = await builder.createAwsService(Client)
            const clientId = getClientId(new GlobalState(new FakeMemento()))
            const regex = new RegExp(`ClientId/${clientId}`)
            assert.ok(service.config.customUserAgent![0][0].match(regex))
        })

        it('does not override custom user-agent if specified in options', async function () {
            const service = await builder.createAwsService(Client, {
                customUserAgent: [['CUSTOM USER AGENT']],
            })

            assert.strictEqual(service.config.customUserAgent[0][0], 'CUSTOM USER AGENT')
        })

        it('can use endpoint override', async function () {
            const settings = new TestSettings()
            await settings.update('aws.dev.endpoints', { foo: 'http://example.com' })

            const service = await builder.createAwsService(
                Client,
                {
                    customUserAgent: [['CUSTOM USER AGENT']],
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
                Client,
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
    })
})
