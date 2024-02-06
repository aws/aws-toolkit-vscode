/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CredentialsProfileMru } from '../../../shared/credentials/credentialsProfileMru'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('CredentialsProfileMru', function () {
    it('lists no profile when none exist', async function () {
        const credentialsMru = new CredentialsProfileMru(await FakeExtensionContext.create())

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length, 0)
    })

    it('lists single profile when only one exists', async function () {
        const credentialsMru = new CredentialsProfileMru(await FakeExtensionContext.create())

        await credentialsMru.setMostRecentlyUsedProfile('apples')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length >= 1, true)
        assert.strictEqual(mru[0], 'apples')
    })

    it('lists multiple profiles when multiple exist', async function () {
        const credentialsMru = new CredentialsProfileMru(await FakeExtensionContext.create())

        await credentialsMru.setMostRecentlyUsedProfile('dogs')
        await credentialsMru.setMostRecentlyUsedProfile('cats')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length >= 2, true)
        assert.strictEqual(mru[0], 'cats')
        assert.strictEqual(mru[1], 'dogs')
    })

    it('does not list duplicate profiles', async function () {
        const credentialsMru = new CredentialsProfileMru(await FakeExtensionContext.create())

        await credentialsMru.setMostRecentlyUsedProfile('bbq')
        await credentialsMru.setMostRecentlyUsedProfile('dill')
        await credentialsMru.setMostRecentlyUsedProfile('ketchup')
        await credentialsMru.setMostRecentlyUsedProfile('bbq')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length >= 3, true)
        assert.strictEqual(mru[0], 'bbq')
        assert.strictEqual(mru[1], 'ketchup')
        assert.strictEqual(mru[2], 'dill')
    })

    it('does not list more than MAX_CRENDTIAL_MRU_SIZE profiles', async function () {
        const credentialsMru = new CredentialsProfileMru(await FakeExtensionContext.create())

        for (let i = 0; i < CredentialsProfileMru.maxCredentialMruSize + 1; i++) {
            await credentialsMru.setMostRecentlyUsedProfile(`entry${i}`)
        }

        const mru = credentialsMru.getMruList()
        assert.strictEqual(mru.length, CredentialsProfileMru.maxCredentialMruSize)
    })
})
