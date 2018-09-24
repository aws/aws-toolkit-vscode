/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CredentialsProfileMru } from '../shared/credentials/credentialsProfileMru'
import { SettingsConfiguration } from '../shared/settingsConfiguration'

class TestSettingsConfiguration implements SettingsConfiguration {

    private _data: { [key: string]: string } = {}

    readSetting(settingKey: string, defaultValue?: string | undefined): string | undefined {
        return this._data[settingKey]
    }

    async writeSetting(settingKey: string, value: string | string[], target: any): Promise<void> {
        let persistedValue: string
        if (value && value instanceof Array) {
            persistedValue = value.join()
        } else {
            persistedValue = value
        }

        this._data[settingKey] = persistedValue
    }
}

suite("CredentialsProfileMru Tests", function (): void {

    test('Set and Get one', async function () {

        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile("apples")

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 1, true)
        assert.equal(mru[0], "apples")
    })

    test('Set and Get two', async function () {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile("dogs")
        await credentialsMru.setMostRecentlyUsedProfile("cats")

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 2, true)
        assert.equal(mru[0], "cats")
        assert.equal(mru[1], "dogs")
    })

    test('Set one already in MRU', async function () {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile("bbq")
        await credentialsMru.setMostRecentlyUsedProfile("dill")
        await credentialsMru.setMostRecentlyUsedProfile("ketchup")
        await credentialsMru.setMostRecentlyUsedProfile("bbq")

        const mru = credentialsMru.getMruList()

        assert(mru)
        assert.equal(mru.length >= 3, true)
        assert.equal(mru[0], "bbq")
        assert.equal(mru[1], "ketchup")
        assert.equal(mru[2], "dill")
    })

    test('Get MRU with size limit', async function () {
        const credentialsMru = new CredentialsProfileMru(new TestSettingsConfiguration())

        await credentialsMru.setMostRecentlyUsedProfile("one")
        await credentialsMru.setMostRecentlyUsedProfile("two")
        await credentialsMru.setMostRecentlyUsedProfile("three")
        await credentialsMru.setMostRecentlyUsedProfile("four")

        for (let i: number = 0; i < 3; i++) {
            const mru = credentialsMru.getMruList(i + 1)

            assert(mru)
            assert.equal(mru.length, i + 1)
        }
    })

})