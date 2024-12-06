/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { version } from 'vscode'
import { getClientId } from '../../shared/telemetry/util'
import { FakeMemento } from '../fakeExtensionContext'
import { FakeAwsContext } from '../utilities/fakeAwsContext'
import { GlobalState } from '../../shared/globalState'
import { AWSClientBuilderV3, getServiceId, recordErrorTelemetry } from '../../shared/awsClientBuilderV3'
import { Client } from '@aws-sdk/smithy-client'
import { extensionVersion } from '../../shared'
import { assertTelemetry } from '../testUtil'
import { telemetry } from '../../shared/telemetry'

describe('AwsClientBuilderV3', function () {
    let builder: AWSClientBuilderV3

    beforeEach(async function () {
        builder = new AWSClientBuilderV3(new FakeAwsContext())
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
            assert.strictEqual(service.config.customUserAgent![0][1], extensionVersion)
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
            assert.ok(service.config.customUserAgent![0][0].match(regex))
        })

        it('does not override custom user-agent if specified in options', async function () {
            const service = await builder.createAwsService(Client, {
                customUserAgent: [['CUSTOM USER AGENT']],
            })

            assert.strictEqual(service.config.customUserAgent[0][0], 'CUSTOM USER AGENT')
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
