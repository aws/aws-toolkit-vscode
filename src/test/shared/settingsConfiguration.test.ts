/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as env from '../../shared/vscode/env'
import {
    DevSettings,
    Experiments,
    fromPackage,
    PromptSettings,
    SettingsConfiguration,
} from '../../shared/settingsConfiguration'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'

const SETTINGS_TARGET = vscode.ConfigurationTarget.Workspace

describe('SettingsConfiguration', function () {
    // These tests use an actual extension setting, because vscode.WorkspaceConfiguration fails when
    // you attempt to update one that isn't defined in package.json. We will restore the setting value
    // at the end of the tests.
    const SETTING_KEY = 'aws.telemetry'

    let sut: SettingsConfiguration

    beforeEach(function () {
        sut = new SettingsConfiguration(SETTINGS_TARGET)
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
        // Empty objects cause pass-through to the global scope; clear your settings if the below test fails
        { testValue: {}, desc: 'empty object' },
        { testValue: { value: 'foo' }, desc: 'object' },
        // Note: we don't test undefined because retrieval returns the package.json configured default value, if there is one
    ]

    describe('getSetting', function () {
        let settings: vscode.WorkspaceConfiguration

        beforeEach(function () {
            settings = vscode.workspace.getConfiguration()
        })

        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await settings.update(SETTING_KEY, scenario.testValue, SETTINGS_TARGET)

                const actualValue = sut.getSetting(SETTING_KEY)
                assert.deepStrictEqual(actualValue, scenario.testValue)
            })
        })

        it('failure modes', async () => {
            //
            // Missing setting:
            //
            const testSetting = 'aws.bogusSetting'
            assert.strictEqual(sut.getSetting(testSetting), undefined)
            assert.strictEqual(sut.getSetting(testSetting, Boolean), undefined)
            assert.strictEqual(sut.getSetting(testSetting, Boolean, true), true)

            //
            // Setting exists but has wrong type:
            //
            await settings.update(SETTING_KEY, true, SETTINGS_TARGET)
            assert.throws(() => sut.getSetting(SETTING_KEY, String))
            assert.throws(() => sut.getSetting(SETTING_KEY, Number))
            assert.throws(() => sut.getSetting(SETTING_KEY, Object))
            assert.throws(() => sut.getSetting(SETTING_KEY, Number))
        })
    })

    describe('writeSetting', async function () {
        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await sut.updateSetting(SETTING_KEY, scenario.testValue)

                // Write tests need to retrieve vscode.WorkspaceConfiguration after writing the value
                // because they seem to cache values.
                const savedValue = vscode.workspace.getConfiguration().get(SETTING_KEY)

                assert.deepStrictEqual(savedValue, scenario.testValue)
            })
        })
    })

    describe('fromPackage', function () {
        const ProfileSettings = fromPackage('aws', { profile: String })
        let settings: TestSettingsConfiguration
        let instance: InstanceType<typeof ProfileSettings>

        beforeEach(function () {
            settings = new TestSettingsConfiguration()
            instance = new ProfileSettings(settings)
        })

        it('throws if the setting does not exist', function () {
            assert.throws(() => fromPackage('aws', { foo: Boolean }))
        })

        it('throws when the types do not match', function () {
            assert.throws(() => instance.get('profile')) // `undefined` is not `string`
        })

        it('can use a default value', function () {
            assert.strictEqual(instance.get('profile', 'bar'), 'bar')
        })

        it('can use a saved setting', async function () {
            await settings.updateSetting('aws.profile', 'foo')
            assert.strictEqual(instance.get('profile'), 'foo')
        })

        it('ignores the default value if the setting exists', async function () {
            await settings.updateSetting('aws.profile', 'foo')
            assert.strictEqual(instance.get('profile', 'bar'), 'foo')
        })
    })
})

describe('DevSetting', function () {
    const TEST_SETTING = 'forceCloud9'

    let settings: ClassToInterfaceType<SettingsConfiguration>
    let sut: DevSettings

    beforeEach(function () {
        settings = new TestSettingsConfiguration()
        sut = new DevSettings(settings)
    })

    it('can read settings', async function () {
        assert.strictEqual(sut.get(TEST_SETTING, false), false)
        await settings.updateSetting(`aws.dev.${TEST_SETTING}`, true)
        assert.strictEqual(sut.get(TEST_SETTING, false), true)
    })

    it('only changes active settings if a value exists', function () {
        assert.strictEqual(sut.get(TEST_SETTING, true), true)
        assert.deepStrictEqual(sut.activeSettings, {})
    })

    it('only changes active settings if the value is not the default', async function () {
        await settings.updateSetting(`aws.dev.${TEST_SETTING}`, false)
        assert.strictEqual(sut.get(TEST_SETTING, false), false)
        assert.deepStrictEqual(sut.activeSettings, {})
    })

    it('can notify listeners when a setting is retrieved', async function () {
        const state = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out waiting for event')), 1000)
            sut.onDidChangeActiveSettings(() => resolve(sut.activeSettings))
        })

        await settings.updateSetting(`aws.dev.${TEST_SETTING}`, true)
        assert.strictEqual(sut.get(TEST_SETTING, false), true)
        assert.deepStrictEqual(await state, { [TEST_SETTING]: true })
    })

    it('bubbles up errors when in automation', async function () {
        await settings.updateSetting(`aws.dev.${TEST_SETTING}`, 'junk')
        assert.throws(() => sut.get(TEST_SETTING, false))
    })

    it('only throws in automation', async function () {
        const previousDesc = Object.getOwnPropertyDescriptor(env, 'isAutomation')
        assert.ok(previousDesc)

        await settings.updateSetting(`aws.dev.${TEST_SETTING}`, 'junk')
        Object.defineProperty(env, 'isAutomation', { value: () => false })
        assert.strictEqual(sut.get(TEST_SETTING, true), true)

        Object.defineProperty(env, 'isAutomation', previousDesc)
    })
})

describe('PromptSetting', function () {
    const PROMPT_SETTING_KEY = 'aws.suppressPrompts'
    const target = vscode.ConfigurationTarget.Workspace

    let settings: SettingsConfiguration
    let sut: PromptSettings

    beforeEach(async function () {
        settings = new SettingsConfiguration(target)
        sut = new PromptSettings(settings)
        await sut.reset()
    })

    describe('disablePrompt', async function () {
        const promptName = 'apprunnerNotifyPricing'

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
                const defaultSetting = settings.getSetting(PROMPT_SETTING_KEY, Object)
                await settings.updateSetting(PROMPT_SETTING_KEY, scenario.testValue)
                await sut.disablePrompt(promptName)
                const actual = settings.getSetting(PROMPT_SETTING_KEY)
                const expected = { ...defaultSetting, ...scenario.expected }
                assert.deepStrictEqual(actual, expected)
            })
        })
    })

    describe('getSuppressPromptSetting, isPromptEnabled', async function () {
        const promptName = 'apprunnerNotifyPricing'

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
                promptAfter: {},
                desc: 'true when prompt has wrong type',
            },
        ]

        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await settings.updateSetting(PROMPT_SETTING_KEY, scenario.testValue)
                const result = await sut.isPromptEnabled(promptName)
                assert.deepStrictEqual(result, scenario.expected)
                assert.deepStrictEqual(settings.getSetting(PROMPT_SETTING_KEY), scenario.promptAfter)
            })
        })
    })
})

describe('Experiments', function () {
    let sut: Experiments

    beforeEach(async function () {
        sut = new Experiments(new SettingsConfiguration(SETTINGS_TARGET))
        await sut.reset()
    })

    // The `Experiments` class is basically an immutable form of `PromptSettings`

    it('returns false when the setting is missing', async function () {
        assert.strictEqual(await sut.isExperimentEnabled('jsonResourceModification'), false)
    })

    it('returns false for invalid types', async function () {
        await sut.update('jsonResourceModification', 'definitely a boolean' as unknown as boolean)
        assert.strictEqual(await sut.isExperimentEnabled('jsonResourceModification'), false)
    })

    it('returns true when the flag is set', async function () {
        await sut.update('jsonResourceModification', true)
        assert.strictEqual(await sut.isExperimentEnabled('jsonResourceModification'), true)
    })
})
