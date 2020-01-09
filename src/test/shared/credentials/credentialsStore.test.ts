/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { CredentialsStore } from '../../../credentials/credentialsStore'
import { CredentialsProvider } from '../../../credentials/providers/credentialsProvider'

describe('CredentialsStore', async () => {
    let sandbox: sinon.SinonSandbox
    let sut: CredentialsStore
    const sampleCredentials = ({} as any) as AWS.Credentials

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        sut = new CredentialsStore()
    })

    afterEach(async () => {
        sandbox.restore()
    })

    function makeSampleCredentialsProvider(credentialsHashCode: number = 0): CredentialsProvider {
        return ({
            getCredentials: () => sampleCredentials,
            getHashCode: () => credentialsHashCode
        } as any) as CredentialsProvider
    }

    it('getCredentials returns undefined when credentials are not loaded', async () => {
        assert.strictEqual(await sut.getCredentials('someId'), undefined)
    })

    it('getOrCreateCredentials creates when credentials are not loaded', async () => {
        const provider = makeSampleCredentialsProvider(1)
        const loadedCredentials = await sut.getOrCreateCredentials('someId', provider)

        assert.strictEqual(loadedCredentials.credentials, sampleCredentials)
        assert.strictEqual(loadedCredentials.credentialsHashCode, provider.getHashCode())
    })

    it('getOrCreateCredentials does not call create method once credentials are loaded', async () => {
        const provider = makeSampleCredentialsProvider()
        const getCredentialsStub = sandbox
            .stub(provider, 'getCredentials')
            .onFirstCall()
            .resolves(sampleCredentials)
            .onSecondCall()
            .throws('Create should not be called!')

        const loadedCredentials1 = await sut.getOrCreateCredentials('someId', provider)
        const loadedCredentials2 = await sut.getOrCreateCredentials('someId', provider)

        assert.strictEqual(getCredentialsStub.callCount, 1, 'Expected create method to be called once only')
        assert.strictEqual(loadedCredentials1.credentials, sampleCredentials)
        assert.strictEqual(loadedCredentials2.credentials, sampleCredentials)
    })

    it('getCredentials returns stored credentials', async () => {
        const provider = makeSampleCredentialsProvider(2)
        await sut.getOrCreateCredentials('someId', provider)
        const loadedCredentials = await sut.getCredentials('someId')

        assert.strictEqual(loadedCredentials?.credentials, sampleCredentials)
        assert.strictEqual(loadedCredentials?.credentialsHashCode, provider.getHashCode())
    })

    it('invalidate removes the credentials from storage', async () => {
        await sut.getOrCreateCredentials('someId', makeSampleCredentialsProvider())
        sut.invalidateCredentials('someId')
        const loadedCredentials = await sut.getCredentials('someId')

        assert.strictEqual(loadedCredentials, undefined)
    })
})
