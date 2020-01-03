/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { CredentialsStore } from '../../../credentials/credentialsStore'

describe('CredentialsStore', async () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
    })

    afterEach(async () => {
        sandbox.restore()
    })

    it('getCredentials returns undefined when credentials are not loaded', async () => {
        const store = new CredentialsStore()

        assert.strictEqual(await store.getCredentials('someId'), undefined)
    })

    it('getCredentialsOrCreate creates when credentials are not loaded', async () => {
        const sampleCredentials = ({} as any) as AWS.Credentials
        const store = new CredentialsStore()

        const loadedCredentials = await store.getCredentialsOrCreate('someId', async credentialsId => {
            assert.strictEqual(credentialsId, 'someId')

            return sampleCredentials
        })

        assert.strictEqual(loadedCredentials, sampleCredentials)
    })

    it('getCredentialsOrCreate does not call create method once credentials are loaded', async () => {
        const sampleCredentials = ({} as any) as AWS.Credentials
        const store = new CredentialsStore()
        const fn = sandbox
            .stub()
            .onFirstCall()
            .resolves(sampleCredentials)
            .onSecondCall()
            .throws('Create should not be called!')

        const loadedCredentials1 = await store.getCredentialsOrCreate('someId', fn)
        const loadedCredentials2 = await store.getCredentialsOrCreate('someId', fn)

        assert.strictEqual(fn.callCount, 1, 'Expected create method to be called once only')
        assert.strictEqual(loadedCredentials1, sampleCredentials)
        assert.strictEqual(loadedCredentials2, sampleCredentials)
    })

    it('getCredentials returns stored credentials', async () => {
        const sampleCredentials = ({} as any) as AWS.Credentials
        const store = new CredentialsStore()

        await store.getCredentialsOrCreate('someId', async () => sampleCredentials)
        const loadedCredentials = await store.getCredentials('someId')

        assert.strictEqual(loadedCredentials, sampleCredentials)
    })

    it('invalidate removes the credentials from storage', async () => {
        const sampleCredentials = ({} as any) as AWS.Credentials
        const store = new CredentialsStore()

        await store.getCredentialsOrCreate('someId', async () => sampleCredentials)
        store.invalidateCredentials('someId')
        const loadedCredentials = await store.getCredentials('someId')

        assert.strictEqual(loadedCredentials, undefined)
    })
})
