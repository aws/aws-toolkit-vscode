/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { LoginManager } from '../../../credentials/loginManager'
import { CredentialsProvider } from '../../../credentials/providers/credentialsProvider'
import { CredentialsProviderId } from '../../../credentials/providers/credentialsProviderId'
import { CredentialsProviderManager } from '../../../credentials/providers/credentialsProviderManager'
import { AwsContext } from '../../../shared/awsContext'
import * as accountId from '../../../shared/credentials/accountId'
import { CredentialsStore } from '../../../credentials/credentialsStore'

describe('LoginManager', async () => {
    let sandbox: sinon.SinonSandbox

    const awsContext = ({
        setCredentials: () => {
            throw new Error('This test was not initialized')
        },
    } as any) as AwsContext
    const sampleCredentials = ({} as any) as AWS.Credentials
    const sampleCredentialsProviderId: CredentialsProviderId = {
        credentialType: 'test',
        credentialTypeId: 'someId',
    }

    const credentialsStore = new CredentialsStore()

    let loginManager: LoginManager
    let credentialsProvider: CredentialsProvider
    let getAccountIdStub: sinon.SinonStub<[AWS.Credentials, string], Promise<string | undefined>>
    let getCredentialsProviderStub: sinon.SinonStub<[CredentialsProviderId], Promise<CredentialsProvider | undefined>>
    let recordAwsSetCredentialsSpy: any

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        recordAwsSetCredentialsSpy = sandbox.spy()

        loginManager = new LoginManager(awsContext, credentialsStore, recordAwsSetCredentialsSpy)
        credentialsProvider = {
            getCredentials: sandbox.stub().resolves(sampleCredentials),
            getCredentialsProviderId: sandbox.stub().returns(sampleCredentialsProviderId),
            getDefaultRegion: sandbox.stub().returns('someRegion'),
            getHashCode: sandbox.stub().returns('1234'),
            canAutoConnect: sandbox.stub().returns(true),
        }

        getAccountIdStub = sandbox.stub(accountId, 'getAccountId')
        getAccountIdStub.resolves('AccountId1234')
        getCredentialsProviderStub = sandbox.stub(CredentialsProviderManager.getInstance(), 'getCredentialsProvider')
        getCredentialsProviderStub.resolves(credentialsProvider)
    })

    afterEach(async () => {
        sandbox.restore()
    })

    it('passive login does NOT send telemetry', async () => {
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')
        await loginManager.login({ passive: true, providerId: sampleCredentialsProviderId })

        assert.strictEqual(setCredentialsStub.callCount, 1)
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, false)
    })

    it('non-passive login sends telemetry', async () => {
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')
        await loginManager.login({ passive: false, providerId: sampleCredentialsProviderId })

        assert.strictEqual(setCredentialsStub.callCount, 1)
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, true)
    })

    it('logs in with credentials (happy path)', async () => {
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')

        await loginManager.login({ passive: false, providerId: sampleCredentialsProviderId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, true)
    })

    it('logs out (happy path)', async () => {
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')

        await loginManager.login({ passive: false, providerId: sampleCredentialsProviderId })
        await loginManager.logout()
        assert.strictEqual(setCredentialsStub.callCount, 2, 'Expected awsContext setCredentials to be called twice')
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, true)
    })

    it('logs out if credentials could not be retrieved', async () => {
        getCredentialsProviderStub.reset()
        getCredentialsProviderStub.resolves(undefined)
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login({ passive: true, providerId: sampleCredentialsProviderId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, false)
    })

    it('logs out if an account Id could not be determined', async () => {
        getAccountIdStub.reset()
        getAccountIdStub.resolves(undefined)
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login({ passive: false, providerId: sampleCredentialsProviderId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, true)
    })

    it('logs out if getting an account Id throws an Error', async () => {
        getAccountIdStub.reset()
        getAccountIdStub.throws('Simulating getAccountId throwing an Error')
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login({ passive: false, providerId: sampleCredentialsProviderId })
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
        assert.strictEqual(recordAwsSetCredentialsSpy.calledOnce, true)
    })
})
