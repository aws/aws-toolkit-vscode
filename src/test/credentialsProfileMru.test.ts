/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CredentialsProfileMru } from '../shared/credentials/credentialsProfileMru'
import { SettingsConfiguration } from '../shared/settingsConfiguration'

class TestSettingsConfiguration implements SettingsConfiguration {

    private readonly _data: { [key: string]: any } = {}

    public readSetting<T>(settingKey: string, defaultValue?: T | undefined): T | undefined {
        return this._data[settingKey] as T
    }

    public async writeSetting<T>(settingKey: string, value: T, target: any): Promise<void> {
        this._data[settingKey] = value
    }
}

suite('CredentialsProfileMru Tests', function(): void {

    test('Set and Get one', async function() {

        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile('apples')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 1, true)
        assert.equal(mru[0], 'apples')
    })

    test('Set and Get two', async function() {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile('dogs')
        await credentialsMru.setMostRecentlyUsedProfile('cats')

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 2, true)
        assert.equal(mru[0], 'cats')
        assert.equal(mru[1], 'dogs')
    })

    test('Set one already in MRU', async function() {
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

    test('MRU max size trim', async function() {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        for (let i = 0; i < CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE + 1; i++) {
            await credentialsMru.setMostRecentlyUsedProfile(`entry${i}`)
        }

        const mru = credentialsMru.getMruList()
        assert.equal(mru.length, CredentialsProfileMru.MAX_CREDENTIAL_MRU_SIZE)
    })
})
