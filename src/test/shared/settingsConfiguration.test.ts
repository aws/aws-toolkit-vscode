/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

describe('DefaultSettingsConfiguration', function () {
    // These tests use an actual extension setting, because vscode.WorkspaceConfiguration fails when
    // you attempt to update one that isn't defined in package.json. We will restore the setting value
    // at the end of the tests.
    const SETTING_KEY = 'telemetry'
    let originalSettingValue: any
    let sandbox: sinon.SinonSandbox

    let sut: DefaultSettingsConfiguration

    before(async function () {
        originalSettingValue = vscode.workspace.getConfiguration(extensionSettingsPrefix).get(SETTING_KEY)
    })

    beforeEach(async function () {
        sut = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    })

    after(async function () {
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
    // Methods 'disable' and 'shouldDisplayPrompt' write to a specific setting and cannot use the same setting as used for testing 'readSetting' and 'writeSetting'
    describe('disable', function () {
        const promptName = 'promptName'
        const fakePromptSetting = { promptName: false }
        const fakePromptSettingTrue = { promptName: true }

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(async function () {
            sandbox.restore()
        })

        it('sets prompt suppress value to true', async function () {
            sandbox.stub(sut, 'getSuppressPromptSetting').returns(fakePromptSetting)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptName)
            const expectedParam = { promptName: true }
            assert.strictEqual(
                writeStub.calledOnceWith('suppressPrompts', expectedParam, vscode.ConfigurationTarget.Global),
                true
            )
        })

        it('does not update if already suppressed', async function () {
            sandbox.stub(sut, 'getSuppressPromptSetting').returns(fakePromptSettingTrue)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptName)
            assert.strictEqual(writeStub.notCalled, true)
        })

        it('does nothing if setting undefined ', async function () {
            sandbox.stub(sut, 'getSuppressPromptSetting').returns(undefined)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptName)
            assert.strictEqual(writeStub.notCalled, true)
        })
    })
    describe('getSuppressPromptSetting', async function () {
        const promptName = 'promptName'
        const fakePromptSetting = { promptName: false, secondName: true }

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(async function () {
            sandbox.restore()
        })

        it('resets setting if incorrect type found', async function () {
            sandbox.stub(sut, 'readSetting').returns(7)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            const result = sut.getSuppressPromptSetting(promptName)
            const expectedParam = {}
            assert.strictEqual(
                writeStub.calledOnceWith('suppressPrompts', expectedParam, vscode.ConfigurationTarget.Global),
                true
            )
            assert.strictEqual(result, undefined)
        })

        it('resets setting if prompt value is wrong type', async function () {
            sandbox.stub(sut, 'readSetting').returns({ promptName: 7 })
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            const result = sut.getSuppressPromptSetting(promptName)
            const expectedParam = {}
            assert.strictEqual(
                writeStub.calledOnceWith('suppressPrompts', expectedParam, vscode.ConfigurationTarget.Global),
                true
            )
            assert.strictEqual(result, undefined)
        })

        it('returns setting object', async function () {
            sandbox.stub(sut, 'readSetting').returns(fakePromptSetting)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            const result = sut.getSuppressPromptSetting(promptName)
            assert.strictEqual(result, fakePromptSetting)
            assert.strictEqual(writeStub.notCalled, true)
        })
    })

    describe('shouldDisplayPrompt', async function () {
        const promptName = 'promptName'
        const fakePromptSetting = { promptName: false, secondName: true }
        const fakePromptSettingTrue = { promptName: true }

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(async function () {
            sandbox.restore()
        })

        it('returns false when suppressed', async function () {
            sandbox.stub(sut, 'getSuppressPromptSetting').returns(fakePromptSettingTrue)
            const actual = sut.shouldDisplayPrompt(promptName)
            assert.strictEqual(actual, false)
        })

        it('returns true when not suppressed', async function () {
            sandbox.stub(sut, 'getSuppressPromptSetting').returns(fakePromptSetting)
            const actual = sut.shouldDisplayPrompt(promptName)
            assert.strictEqual(actual, true)
        })

        it('defaults to true when setting is undefined', async function () {
            sandbox.stub(sut, 'getSuppressPromptSetting').returns(undefined)
            const actual = sut.shouldDisplayPrompt(promptName)
            assert.strictEqual(actual, true)
        })
    })
})
