/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { CredentialsStore } from '../../../credentials/credentialsStore'

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

    it('getCredentials returns undefined when credentials are not loaded', async () => {
        assert.strictEqual(await sut.getCredentials('someId'), undefined)
    })

    it('getCredentialsOrCreate creates when credentials are not loaded', async () => {
        const loadedCredentials = await sut.getCredentialsOrCreate('someId', async credentialsId => {
            assert.strictEqual(credentialsId, 'someId')

            return {
                credentials: sampleCredentials,
                credentialsHashCode: 0
            }
        })

        assert.strictEqual(loadedCredentials, sampleCredentials)
    })

    it('getCredentialsOrCreate does not call create method once credentials are loaded', async () => {
        const fn = sandbox
            .stub()
            .onFirstCall()
            .resolves({
                credentials: sampleCredentials,
                credentialsHashCode: 1234
            })
            .onSecondCall()
            .throws('Create should not be called!')

        const loadedCredentials1 = await sut.getCredentialsOrCreate('someId', fn)
        const loadedCredentials2 = await sut.getCredentialsOrCreate('someId', fn)

        assert.strictEqual(fn.callCount, 1, 'Expected create method to be called once only')
        assert.strictEqual(loadedCredentials1, sampleCredentials)
        assert.strictEqual(loadedCredentials2, sampleCredentials)
    })

    it('getCredentials returns stored credentials', async () => {
        await sut.getCredentialsOrCreate('someId', async () => {
            return {
                credentials: sampleCredentials,
                credentialsHashCode: 0
            }
        })
        const loadedCredentials = await sut.getCredentials('someId')

        assert.strictEqual(loadedCredentials, sampleCredentials)
    })

    it('getCredentialsHashCode returns stored credentials hashcode', async () => {
        await sut.getCredentialsOrCreate('someId', async () => {
            return {
                credentials: sampleCredentials,
                credentialsHashCode: 12345678
            }
        })
        const hashCode = sut.getCredentialsHashCode('someId')

        assert.strictEqual(hashCode, 12345678)
    })

    it('getCredentialsHashCode returns undefined when no credentials are stored', async () => {
        const hashCode = sut.getCredentialsHashCode('someId')

        assert.strictEqual(hashCode, undefined)
    })

    it('invalidate removes the credentials from storage', async () => {
        await sut.getCredentialsOrCreate('someId', async () => {
            return {
                credentials: sampleCredentials,
                credentialsHashCode: 0
            }
        })
        sut.invalidateCredentials('someId')
        const loadedCredentials = await sut.getCredentials('someId')

        assert.strictEqual(loadedCredentials, undefined)
    })
})
