/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

describe('DefaultSettingsConfiguration', () => {
    // These tests use an actual extension setting, because vscode.WorkspaceConfiguration fails when
    // you attempt to update one that isn't defined in package.json. We will restore the setting value
    // at the end of the tests.
    const SETTING_KEY = 'telemetry'
    let originalSettingValue: any

    let sut: DefaultSettingsConfiguration

    before(async () => {
        originalSettingValue = vscode.workspace.getConfiguration(extensionSettingsPrefix).get(SETTING_KEY)
    })

    beforeEach(async () => {
        sut = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    })

    after(async () => {
        await vscode.workspace
            .getConfiguration(extensionSettingsPrefix)
            .update(SETTING_KEY, originalSettingValue, vscode.ConfigurationTarget.Global)
    })

    const scenarios = [
        { testValue: 1234, desc: 'number' },
        { testValue: 0, desc: 'default number' },
        { testValue: 'hello world', desc: 'string' },
        { testValue: '', desc: 'default string' },
        { testValue: true, desc: 'true' },
        { testValue: false, desc: 'false' },
        { testValue: [], desc: 'empty array' },
        { testValue: [{ value: 'foo' }, { value: 'bar' }], desc: 'array' },
        { testValue: {}, desc: 'empty object' },
        { testValue: { value: 'foo' }, desc: 'object' },
        // Note: we don't test undefined because retrieval returns the package.json configured default value, if there is one
    ]

    describe('readSetting', async () => {
        let settings: vscode.WorkspaceConfiguration

        beforeEach(async () => {
            settings = vscode.workspace.getConfiguration(extensionSettingsPrefix)
        })

        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await settings.update(SETTING_KEY, scenario.testValue, vscode.ConfigurationTarget.Global)

                const actualValue = sut.readSetting(SETTING_KEY)
                assert.deepStrictEqual(actualValue, scenario.testValue)
            })
        })
    })

    describe('writeSetting', async () => {
        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await sut.writeSetting(SETTING_KEY, scenario.testValue, vscode.ConfigurationTarget.Global)

                // Write tests need to retrieve vscode.WorkspaceConfiguration after writing the value
                // because they seem to cache values.
                const savedValue = vscode.workspace.getConfiguration(extensionSettingsPrefix).get(SETTING_KEY)

                assert.deepStrictEqual(savedValue, scenario.testValue)
            })
        })
    })
})
