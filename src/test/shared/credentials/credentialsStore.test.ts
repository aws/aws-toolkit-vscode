/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { CredentialsStore } from '../../../credentials/credentialsStore'
import { CredentialsProvider, CredentialsId } from '../../../credentials/providers/credentials'

describe('CredentialsStore', async function () {
    let sandbox: sinon.SinonSandbox
    let sut: CredentialsStore
    const sampleCredentials = ({} as any) as AWS.Credentials
    const sampleCredentialsId: CredentialsId = {
        credentialSource: 'profile',
        credentialTypeId: 'someId',
    }
    const sampleExpiredCredentials = ({ expired: true } as any) as AWS.Credentials

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        sut = new CredentialsStore()
    })

    afterEach(async function () {
        sandbox.restore()
    })

    function makeSampleCredentialsProvider(
        credentialsHashCode: number = 0,
        testCredentials: AWS.Credentials
    ): CredentialsProvider {
        return ({
            getCredentials: () => testCredentials,
            getHashCode: () => credentialsHashCode,
        } as any) as CredentialsProvider
    }

    it('getCredentials returns undefined when credentials are not loaded', async function () {
        assert.strictEqual(await sut.getCredentials(sampleCredentialsId), undefined)
    })

    it('upsertCredentials creates when credentials are not loaded', async function () {
        const provider = makeSampleCredentialsProvider(1, sampleCredentials)
        const loadedCredentials = await sut.upsertCredentials(sampleCredentialsId, provider)

        assert.strictEqual(loadedCredentials.credentials, sampleCredentials)
        assert.strictEqual(loadedCredentials.credentialsHashCode, provider.getHashCode())
    })

    it('upsertCredentials does not call create method once credentials are loaded', async function () {
        const provider = makeSampleCredentialsProvider(0, sampleCredentials)
        const getCredentialsStub = sandbox
            .stub(provider, 'getCredentials')
            .onFirstCall()
            .resolves(sampleCredentials)
            .onSecondCall()
            .throws('Create should not be called!')

        const loadedCredentials1 = await sut.upsertCredentials(sampleCredentialsId, provider)
        const loadedCredentials2 = await sut.upsertCredentials(sampleCredentialsId, provider)

        assert.strictEqual(getCredentialsStub.callCount, 1, 'Expected create method to be called once only')
        assert.strictEqual(loadedCredentials1.credentials, sampleCredentials)
        assert.strictEqual(loadedCredentials2.credentials, sampleCredentials)
    })

    it('getCredentials returns stored credentials', async function () {
        const provider = makeSampleCredentialsProvider(2, sampleCredentials)
        await sut.upsertCredentials(sampleCredentialsId, provider)
        const loadedCredentials = await sut.getCredentials(sampleCredentialsId)

        assert.strictEqual(loadedCredentials?.credentials, sampleCredentials)
        assert.strictEqual(loadedCredentials?.credentialsHashCode, provider.getHashCode())
    })

    it('invalidate removes the credentials from storage', async function () {
        await sut.upsertCredentials(sampleCredentialsId, makeSampleCredentialsProvider(0, sampleCredentials))
        sut.invalidateCredentials(sampleCredentialsId)
        const loadedCredentials = await sut.getCredentials(sampleCredentialsId)

        assert.strictEqual(loadedCredentials, undefined)
    })

    it('getCredentials returns undefined when credentials are expired', async () => {
        const provider = makeSampleCredentialsProvider(0, sampleExpiredCredentials)

        await sut.upsertCredentials(sampleCredentialsId, provider)
        const cachedCredentials = await sut.getCredentials(sampleCredentialsId)

        assert.strictEqual(cachedCredentials, undefined)
    })
})
