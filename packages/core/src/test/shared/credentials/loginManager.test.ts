/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from '@aws-sdk/types'
import assert from 'assert'
import * as sinon from 'sinon'
import { LoginManager } from '../../../auth/deprecated/loginManager'
import { CredentialsProvider, CredentialsId } from '../../../auth/providers/credentials'
import { CredentialsProviderManager } from '../../../auth/providers/credentialsProviderManager'
import { AwsContext } from '../../../shared/awsContext'
import { CredentialsStore } from '../../../auth/credentials/store'
import { assertTelemetryCurried } from '../../testUtil'
import { DefaultStsClient } from '../../../shared/clients/stsClient'

describe('LoginManager', async function () {
    let sandbox: sinon.SinonSandbox

    const awsContext = {
        setCredentials: () => {
            throw new Error('This test was not initialized')
        },
        getExplorerRegions: () => [],
    } as any as AwsContext
    const sampleCredentials = {} as any as AWS.Credentials
    const sampleCredentialsId: CredentialsId = {
        credentialSource: 'profile',
        credentialTypeId: 'someId',
    }
    const credentialType = 'staticProfile'
    const credentialSourceId = 'sharedCredentials'

    const credentialsStore = new CredentialsStore()

    let loginManager: LoginManager
    let credentialsProvider: CredentialsProvider
    let getAccountIdStub: sinon.SinonStub<[], Promise<{ Account?: string } | undefined>>
    let getCredentialsProviderStub: sinon.SinonStub<[CredentialsId], Promise<CredentialsProvider | undefined>>

    beforeEach(async function () {
        sandbox = sinon.createSandbox()

        loginManager = new LoginManager(awsContext, credentialsStore)
        credentialsProvider = {
            getCredentials: sandbox.stub().resolves(sampleCredentials),
            getProviderType: sandbox.stub().returns('profile'),
            getTelemetryType: sandbox.stub().returns('staticProfile'),
            getCredentialsId: sandbox.stub().returns(sampleCredentialsId),
            getDefaultRegion: sandbox.stub().returns('someRegion'),
            getHashCode: sandbox.stub().returns('1234'),
            canAutoConnect: sandbox.stub().returns(true),
            isAvailable: sandbox.stub().returns(Promise.resolve(true)),
        }

        getAccountIdStub = sandbox.stub(DefaultStsClient.prototype, 'getCallerIdentity').resolves({
            Account: 'AccountId1234',
        })

        getCredentialsProviderStub = sandbox.stub(CredentialsProviderManager.getInstance(), 'getCredentialsProvider')
        getCredentialsProviderStub.resolves(credentialsProvider)
    })

    afterEach(async function () {
        sandbox.restore()
    })

    const assertTelemetry = assertTelemetryCurried('aws_validateCredentials')

    it('passive login sends telemetry with passive=true', async function () {
        const passive = true
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')
        await loginManager.login({ passive, providerId: sampleCredentialsId })

        assert.strictEqual(setCredentialsStub.callCount, 1)
        assertTelemetry({ result: 'Succeeded', passive, credentialType, credentialSourceId })
    })

    it('non-passive login sends telemetry', async function () {
        const passive = false
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')
        await loginManager.login({ passive, providerId: sampleCredentialsId })

        assert.strictEqual(setCredentialsStub.callCount, 1)
        assertTelemetry({ result: 'Succeeded', passive, credentialType, credentialSourceId })
    })

    it('logs in with credentials (happy path)', async function () {
        const passive = false
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')

        await loginManager.login({ passive, providerId: sampleCredentialsId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assertTelemetry({ result: 'Succeeded', passive, credentialType, credentialSourceId })
    })

    it('logs out (happy path)', async function () {
        const passive = false
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')

        await loginManager.login({ passive, providerId: sampleCredentialsId })
        await loginManager.logout()
        assert.strictEqual(setCredentialsStub.callCount, 2, 'Expected awsContext setCredentials to be called twice')
        assertTelemetry({ result: 'Succeeded', passive, credentialType, credentialSourceId })
    })

    it('logs out if credentials could not be retrieved', async function () {
        const passive = true
        getCredentialsProviderStub.reset()
        getCredentialsProviderStub.resolves(undefined)
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login({ passive, providerId: sampleCredentialsId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assertTelemetry({ result: 'Failed', passive })
    })

    it('logs out if an account Id could not be determined', async function () {
        const passive = false
        getAccountIdStub.reset()
        getAccountIdStub.resolves(undefined)
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login({ passive, providerId: sampleCredentialsId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assertTelemetry({ result: 'Failed', passive, credentialType, credentialSourceId })
    })

    it('logs out if getting an account Id throws an Error', async function () {
        const passive = false
        getAccountIdStub.reset()
        getAccountIdStub.throws('Simulating getAccountId throwing an Error')
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login({ passive, providerId: sampleCredentialsId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assertTelemetry({ result: 'Failed', passive, credentialType, credentialSourceId })
    })
})
