/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

describe('DefaultSettingsConfiguration', function () {
    // These tests use an actual extension setting, because vscode.WorkspaceConfiguration fails when
    // you attempt to update one that isn't defined in package.json. We will restore the setting value
    // at the end of the tests.
    const SETTING_KEY = 'telemetry'
    const PROMPT_SETTING_KEY = 'suppressPrompts'
    let originalSettingValue: any
    let originalPromptSettingValue: any

    let sut: DefaultSettingsConfiguration

    before(async function () {
        originalSettingValue = vscode.workspace.getConfiguration(extensionSettingsPrefix).get(SETTING_KEY)
        originalPromptSettingValue = vscode.workspace.getConfiguration(extensionSettingsPrefix).get(PROMPT_SETTING_KEY)
    })

    beforeEach(async function () {
        sut = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    })

    after(async function () {
        await vscode.workspace
            .getConfiguration(extensionSettingsPrefix)
            .update(SETTING_KEY, originalSettingValue, vscode.ConfigurationTarget.Global)
        await vscode.workspace
            .getConfiguration(extensionSettingsPrefix)
            .update(PROMPT_SETTING_KEY, originalPromptSettingValue, vscode.ConfigurationTarget.Global)
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

    describe('readSetting', async function () {
        let settings: vscode.WorkspaceConfiguration

        beforeEach(async function () {
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

    describe('writeSetting', async function () {
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

    describe('disablePrompt', async function () {
        let defaultSetting: any
        const promptName = 'apprunnerNotifyPricing'
        beforeEach(async function () {
            // Force the default settings.
            await sut.writeSetting(PROMPT_SETTING_KEY, {}, vscode.ConfigurationTarget.Global)
            defaultSetting = sut.readSetting(PROMPT_SETTING_KEY)
        })

        const scenarios = [
            {
                testValue: { apprunnerNotifyPricing: true, other: false },
                expected: { apprunnerNotifyPricing: true, other: false },
                desc: 'stays suppressed',
            },
            {
                testValue: { apprunnerNotifyPricing: false },
                expected: { apprunnerNotifyPricing: true },
                desc: 'suppresses prompt',
            },
        ]
        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await sut.writeSetting(PROMPT_SETTING_KEY, scenario.testValue, vscode.ConfigurationTarget.Global)
                await sut.disablePrompt(promptName)
                const actual = sut.readSetting(PROMPT_SETTING_KEY)
                const expected = { ...defaultSetting, ...scenario.expected }
                assert.deepStrictEqual(actual, expected)
            })
        })

        it('validates', async function () {
            await assert.rejects(sut.disablePrompt('invalidPrompt'))
        })
    })

    describe('getSuppressPromptSetting, isPromptEnabled', async function () {
        let defaultSetting: any
        const promptName = 'apprunnerNotifyPricing'

        before(async function () {
            await sut.writeSetting(PROMPT_SETTING_KEY, {}, vscode.ConfigurationTarget.Global)
            defaultSetting = sut.readSetting(PROMPT_SETTING_KEY)
        })

        const scenarios = [
            {
                testValue: { apprunnerNotifyPricing: false },
                expected: true,
                promptAfter: { apprunnerNotifyPricing: false },
                desc: 'true when not suppressed',
            },
            {
                testValue: { apprunnerNotifyPricing: true },
                expected: false,
                promptAfter: { apprunnerNotifyPricing: true },
                desc: 'false when suppressed',
            },
            {
                testValue: { wrongName: false },
                expected: true,
                promptAfter: { wrongName: false },
                desc: 'true when not found',
            },
            {
                testValue: { apprunnerNotifyPricing: 7 },
                expected: true,
                promptAfter: { apprunnerNotifyPricing: false },
                desc: 'true when prompt has wrong type',
            },
            { testValue: 'badType', expected: true, promptAfter: {}, desc: 'reset setting if wrong type' },
        ]

        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await sut.writeSetting(PROMPT_SETTING_KEY, scenario.testValue, vscode.ConfigurationTarget.Global)
                const result = await sut.isPromptEnabled(promptName)
                assert.deepStrictEqual(result, scenario.expected)
                assert.deepStrictEqual(sut.readSetting(PROMPT_SETTING_KEY), {
                    ...defaultSetting,
                    ...scenario.promptAfter,
                })
            })
        })

        it('validates', async function () {
            await assert.rejects(sut.isPromptEnabled('invalidPrompt'))
            await assert.rejects(sut.getSuppressPromptSetting('invalidPrompt'))
        })
    })
})
