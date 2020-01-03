/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as credentialsCreator from '../../../credentials/credentialsCreator'
import { LoginManager } from '../../../credentials/loginManager'
import { AwsContext } from '../../../shared/awsContext'
import * as accountId from '../../../shared/credentials/accountId'

describe('LoginManager', async () => {
    let sandbox: sinon.SinonSandbox

    const awsContext = ({
        setCredentials: () => {
            throw new Error('This test was not initialized')
        }
    } as any) as AwsContext
    const sampleCredentials = ({} as any) as AWS.Credentials

    let loginManager: LoginManager
    let getAccountIdStub: sinon.SinonStub<[AWS.Credentials, string], Promise<string | undefined>>
    let createCredentialsStub: sinon.SinonStub<[string], Promise<AWS.Credentials>>

    beforeEach(async () => {
        sandbox = sinon.createSandbox()

        loginManager = new LoginManager(awsContext)
        getAccountIdStub = sandbox.stub(accountId, 'getAccountId')
        createCredentialsStub = sandbox.stub(credentialsCreator, 'createCredentials')
    })

    afterEach(async () => {
        sandbox.restore()
    })

    it('logs in with credentials (happy path)', async () => {
        createCredentialsStub.resolves(sampleCredentials)
        getAccountIdStub.resolves('AccountId1234')
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')

        await loginManager.login('someId')
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
    })

    it('logs out (happy path)', async () => {
        createCredentialsStub.resolves(sampleCredentials)
        getAccountIdStub.resolves('AccountId1234')
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials')

        await loginManager.login('someId')
        await loginManager.logout()
        assert.strictEqual(setCredentialsStub.callCount, 2, 'Expected awsContext setCredentials to be called twice')
    })

    it('logs out if credentials could not be retrieved', async () => {
        createCredentialsStub.resolves(undefined)
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login('someId')
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
    })

    it('logs out if an account Id could not be determined', async () => {
        createCredentialsStub.resolves(sampleCredentials)
        getAccountIdStub.resolves(undefined)
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login('someId')
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
    })

    it('logs out if getting an account Id throws an Error', async () => {
        createCredentialsStub.resolves(sampleCredentials)
        getAccountIdStub.throws('Simulating getAccountId throwing an Error')
        const setCredentialsStub = sandbox.stub(awsContext, 'setCredentials').callsFake(async credentials => {
            // Verify that logout is called
            assert.strictEqual(credentials, undefined)
        })

        await loginManager.login('someId')
        assert.strictEqual(setCredentialsStub.callCount, 1, 'Expected awsContext setCredentials to be called once')
    })
})
