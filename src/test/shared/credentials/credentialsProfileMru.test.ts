/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CredentialsProfileMru } from '../../../shared/credentials/credentialsProfileMru'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('CredentialsProfileMru', () => {
    it('lists no profile when none exist', async () => {
        const credentialsMru = new CredentialsProfileMru(new FakeExtensionContext())

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length, 0)
    })

    it('lists single profile when only one exists', async () => {
        const credentialsMru = new CredentialsProfileMru(new FakeExtensionContext())

        await credentialsMru.setMostRecentlyUsedProfile('apples')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length >= 1, true)
        assert.strictEqual(mru[0], 'apples')
    })

    it('lists multiple profiles when multiple exist', async () => {
        const credentialsMru = new CredentialsProfileMru(new FakeExtensionContext())

        await credentialsMru.setMostRecentlyUsedProfile('dogs')
        await credentialsMru.setMostRecentlyUsedProfile('cats')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.strictEqual(mru.length >= 2, true)
        assert.strictEqual(mru[0], 'cats')
        assert.strictEqual(mru[1], 'dogs')
    })

    it('does not list duplicate profiles', async () => {
        const credentialsMru = new CredentialsProfileMru(new FakeExtensionContext())

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

    it('does not list more than MAX_CRENDTIAL_MRU_SIZE profiles', async () => {
        const credentialsMru = new CredentialsProfileMru(new FakeExtensionContext())

        for (let i = 0; i < CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE + 1; i++) {
            await credentialsMru.setMostRecentlyUsedProfile(`entry${i}`)
        }

        const mru = credentialsMru.getMruList()
        assert.strictEqual(mru.length, CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE)
    })
})
