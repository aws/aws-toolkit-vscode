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
import {
    AWSClientBuilderV3,
    DefaultAWSClientBuilderV3,
    getServiceId,
    recordErrorTelemetry,
} from '../../shared/awsClientBuilderV3'
import { Client } from '@aws-sdk/smithy-client'
import { extensionVersion } from '../../shared'
import { assertTelemetry } from '../testUtil'
import { telemetry } from '../../shared/telemetry'
import { CredentialsShim } from '../../auth/deprecated/loginManager'
import { Credentials } from '@aws-sdk/types'

class MockCredentialsShim implements CredentialsShim {
    public constructor(
        public credentials: Credentials,
        public readonly refreshedCredentials: Credentials
    ) {}

    public expire(): void {
        this.credentials = {
            ...this.credentials,
            expiration: new Date(Date.now() - 1000 * 60 * 60 * 24),
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

describe('DefaultAwsClientBuilderV3', function () {
    let builder: AWSClientBuilderV3
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
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24),
        }
        newCreds = {
            accessKeyId: 'new',
            secretAccessKey: 'new',
            sessionToken: 'new',
            expiration: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
        }
        mockCredsShim = new MockCredentialsShim(oldCreds, newCreds)
        fakeContext.credentialsShim = mockCredsShim
        builder = new DefaultAWSClientBuilderV3(fakeContext)
    })

    describe('createAndConfigureSdkClient', function () {
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

        it('refreshes credentials when they expire', async function () {
            const service = await builder.createAwsService(Client as any)
            assert.strictEqual(await service.config.credentials(), oldCreds)
            mockCredsShim.expire()
            assert.strictEqual(await service.config.credentials(), newCreds)
        })

        it('does not cache stale credentials', async function () {
            const service = await builder.createAwsService(Client as any)
            assert.strictEqual(await service.config.credentials(), oldCreds)
            const newerCreds = {
                accessKeyId: 'old2',
                secretAccessKey: 'old2',
                sessionToken: 'old2',
                expiration: new Date(Date.now() + 1000 * 60 * 60 * 24),
            }
            mockCredsShim.update(newerCreds)
            assert.strictEqual(await service.config.credentials(), newerCreds)
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
