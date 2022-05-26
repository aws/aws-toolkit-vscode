/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as env from '../../shared/vscode/env'
import { DevSettings, Experiments, fromExtensionManifest, PromptSettings, Settings } from '../../shared/settings'
import { TestSettings } from '../utilities/testSettingsConfiguration'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'

const SETTINGS_TARGET = vscode.ConfigurationTarget.Workspace

describe('Settings', function () {
    // These tests use an actual extension setting, because vscode.WorkspaceConfiguration fails when
    // you attempt to update one that isn't defined in package.json. We will restore the setting value
    // at the end of the tests.
    const SETTING_KEY = 'aws.telemetry'

    let sut: Settings

    beforeEach(async function () {
        sut = new Settings(SETTINGS_TARGET)
        await sut.update(SETTING_KEY, undefined)
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

    describe('get', function () {
        let settings: vscode.WorkspaceConfiguration

        beforeEach(function () {
            settings = vscode.workspace.getConfiguration()
        })

        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await settings.update(SETTING_KEY, scenario.testValue, SETTINGS_TARGET)

                const actualValue = sut.get(SETTING_KEY)
                assert.deepStrictEqual(actualValue, scenario.testValue)
            })
        })

        it('failure modes', async () => {
            //
            // Missing setting:
            //
            const testSetting = 'aws.bogusSetting'
            assert.strictEqual(sut.get(testSetting), undefined)
            assert.strictEqual(sut.get(testSetting, Boolean), undefined)
            assert.strictEqual(sut.get(testSetting, Boolean, true), true)

            //
            // Setting exists but has wrong type:
            //
            await settings.update(SETTING_KEY, true, SETTINGS_TARGET)
            assert.throws(() => sut.get(SETTING_KEY, String))
            assert.throws(() => sut.get(SETTING_KEY, Number))
            assert.throws(() => sut.get(SETTING_KEY, Object))
            assert.throws(() => sut.get(SETTING_KEY, Number))
        })
    })

    describe('update', function () {
        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await sut.update(SETTING_KEY, scenario.testValue)

                // Write tests need to retrieve vscode.WorkspaceConfiguration after writing the value
                // because they seem to cache values.
                const savedValue = vscode.workspace.getConfiguration().get(SETTING_KEY)

                assert.deepStrictEqual(savedValue, scenario.testValue)
            })
        })
    })

    describe('onDidChangeSection', function () {
        const rootSection = SETTING_KEY.split('.').shift() ?? ''

        it('fires after a section changes', async function () {
            let eventCount = 0
            sut.onDidChangeSection(rootSection, () => (eventCount += 1))

            await sut.update('editor.tabSize', 4)
            assert.strictEqual(eventCount, 0)

            await sut.update(SETTING_KEY, false)
            assert.strictEqual(eventCount, 1)

            await sut.update(SETTING_KEY, true)
            assert.strictEqual(eventCount, 2)
        })

        it('scopes the event to the affected section', async function () {
            const changedEvent = new Promise<vscode.ConfigurationChangeEvent>((resolve, reject) => {
                setTimeout(() => reject(new Error('Timed out')), 1000)
                sut.onDidChangeSection(rootSection, resolve)
            })

            await sut.update(SETTING_KEY, true)

            const subKey = SETTING_KEY.replace(`${rootSection}.`, '')
            const affectsConfiguration = await changedEvent.then(e => e.affectsConfiguration.bind(e))

            assert.strictEqual(affectsConfiguration('foo'), false)
            assert.strictEqual(affectsConfiguration(subKey), true)
        })
    })

    describe('fromExtensionManifest', function () {
        const ProfileSettings = fromExtensionManifest('aws', { profile: String })
        let settings: TestSettings
        let instance: InstanceType<typeof ProfileSettings>

        beforeEach(function () {
            settings = new TestSettings()
            instance = new ProfileSettings(settings)
        })

        it('throws if the setting does not exist', function () {
            assert.throws(() => fromExtensionManifest('aws', { foo: Boolean }))
        })

        it('can use a default value', function () {
            assert.strictEqual(instance.get('profile', 'bar'), 'bar')
        })

        it('can use a saved setting', async function () {
            await settings.update('aws.profile', 'foo')
            assert.strictEqual(instance.get('profile'), 'foo')
        })

        it('ignores the default value if the setting exists', async function () {
            await settings.update('aws.profile', 'foo')
            assert.strictEqual(instance.get('profile', 'bar'), 'foo')
        })

        it('throws when the types do not match', async function () {
            assert.throws(() => instance.get('profile'))

            await settings.update('aws.profile', true)
            assert.throws(() => instance.get('profile'))

            await settings.update('aws.profile', 123)
            assert.throws(() => instance.get('profile'))
        })
    })
})

describe('DevSetting', function () {
    const TEST_SETTING = 'forceCloud9'

    let settings: ClassToInterfaceType<Settings>
    let sut: DevSettings

    beforeEach(function () {
        settings = new TestSettings()
        sut = new DevSettings(settings)
    })

    it('can read settings', async function () {
        assert.strictEqual(sut.get(TEST_SETTING, false), false)
        await settings.update(`aws.dev.${TEST_SETTING}`, true)
        assert.strictEqual(sut.get(TEST_SETTING, false), true)
    })

    it('only changes active settings if a value exists', function () {
        assert.strictEqual(sut.get(TEST_SETTING, true), true)
        assert.deepStrictEqual(sut.activeSettings, {})
    })

    it('only changes active settings if the value is not the default', async function () {
        await settings.update(`aws.dev.${TEST_SETTING}`, false)
        assert.strictEqual(sut.get(TEST_SETTING, false), false)
        assert.deepStrictEqual(sut.activeSettings, {})
    })

    it('can notify listeners when a setting is retrieved', async function () {
        const state = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out waiting for event')), 1000)
            sut.onDidChangeActiveSettings(() => resolve(sut.activeSettings))
        })

        await settings.update(`aws.dev.${TEST_SETTING}`, true)
        assert.strictEqual(sut.get(TEST_SETTING, false), true)
        assert.deepStrictEqual(await state, { [TEST_SETTING]: true })
    })

    it('bubbles up errors when in automation', async function () {
        await settings.update(`aws.dev.${TEST_SETTING}`, 'junk')
        assert.throws(() => sut.get(TEST_SETTING, false))
    })

    it('only throws in automation', async function () {
        const previousDesc = Object.getOwnPropertyDescriptor(env, 'isAutomation')
        assert.ok(previousDesc)

        await settings.update(`aws.dev.${TEST_SETTING}`, 'junk')
        Object.defineProperty(env, 'isAutomation', { value: () => false })
        assert.strictEqual(sut.get(TEST_SETTING, true), true)

        Object.defineProperty(env, 'isAutomation', previousDesc)
    })
})

describe('PromptSetting', function () {
    const PROMPT_SETTING_KEY = 'aws.suppressPrompts'
    const target = vscode.ConfigurationTarget.Workspace

    let settings: Settings
    let sut: PromptSettings

    beforeEach(async function () {
        settings = new Settings(target)
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
                const defaultSetting = settings.get(PROMPT_SETTING_KEY, Object)
                await settings.update(PROMPT_SETTING_KEY, scenario.testValue)
                await sut.disablePrompt(promptName)
                const actual = settings.get(PROMPT_SETTING_KEY)
                const expected = { ...defaultSetting, ...scenario.expected }
                assert.deepStrictEqual(actual, expected)
            })
        })
    })

    describe('isPromptEnabled', async function () {
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
                await settings.update(PROMPT_SETTING_KEY, scenario.testValue)
                const before = settings.get(PROMPT_SETTING_KEY, Object, {})
                const result = await sut.isPromptEnabled(promptName)

                assert.deepStrictEqual(result, scenario.expected)
                assert.deepStrictEqual(
                    { ...before, ...settings.get(PROMPT_SETTING_KEY, Object) },
                    { ...before, ...scenario.promptAfter }
                )
            })
        })
    })
})

describe('Experiments', function () {
    let sut: Experiments

    beforeEach(async function () {
        sut = new Experiments(new TestSettings())
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

    it('fires events from nested settings', async function () {
        const info = vscode.workspace.getConfiguration().inspect('aws.experiments.jsonResourceModification')
        if (info?.globalValue) {
            this.skip()
        }

        const experiments = new Experiments(new Settings(vscode.ConfigurationTarget.Workspace))

        try {
            const key = new Promise<string>((resolve, reject) => {
                experiments.onDidChange(event => resolve(event.key))
                setTimeout(() => reject(new Error('Timed out waiting for settings event')), 5000)
            })

            await experiments.update('jsonResourceModification', true)
            assert.strictEqual(await key, 'jsonResourceModification')
        } finally {
            await experiments.reset()
        }
    })
})
