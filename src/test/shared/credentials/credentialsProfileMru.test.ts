/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CredentialsProfileMru } from '../../../shared/credentials/credentialsProfileMru'
import { SettingsConfiguration } from '../../../shared/settingsConfiguration'

class TestSettingsConfiguration implements SettingsConfiguration {

    private readonly _data: { [key: string]: any } = {}

    public readSetting<T>(settingKey: string, defaultValue?: T | undefined): T | undefined {
        return this._data[settingKey] as T
    }

    public async writeSetting<T>(settingKey: string, value: T, target: any): Promise<void> {
        this._data[settingKey] = value
    }
}

describe('CredentialsProfileMru', function(): void {

    it('lists single profile when only one exists', async function() {

        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile('apples')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 1, true)
        assert.equal(mru[0], 'apples')
    })

    it('lists multiple profiles when multiple exist', async function() {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile('dogs')
        await credentialsMru.setMostRecentlyUsedProfile('cats')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 2, true)
        assert.equal(mru[0], 'cats')
        assert.equal(mru[1], 'dogs')
    })

    it('does not list duplicate profiles', async function() {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile('bbq')
        await credentialsMru.setMostRecentlyUsedProfile('dill')
        await credentialsMru.setMostRecentlyUsedProfile('ketchup')
        await credentialsMru.setMostRecentlyUsedProfile('bbq')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 3, true)
        assert.equal(mru[0], 'bbq')
        assert.equal(mru[1], 'ketchup')
        assert.equal(mru[2], 'dill')
    })

    it('does not list more than MAX_CRENDTIAL_MRU_SIZE profiles', async function() {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        for (let i = 0; i < CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE + 1; i++) {
            await credentialsMru.setMostRecentlyUsedProfile(`entry${i}`)
        }

        const mru = credentialsMru.getMruList()
        assert.equal(mru.length, CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE)
    })
})
