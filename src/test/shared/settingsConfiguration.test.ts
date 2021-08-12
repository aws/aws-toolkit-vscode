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
        const promptToAdd = 'fakePrompt'
        const testResponeEmpty: string[] = []
        const testResponseWrongType = { p: 'v' }
        const testResponseIncluded = ['other', 'fakePrompt']
        const testResponseUndefined = undefined
        beforeEach(async function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(async function () {
            sandbox.restore()
        })

        it('appends to list if not included', async function () {
            sandbox.stub(sut, 'readSetting').returns(testResponeEmpty)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptToAdd)
            const expectedResult = ['fakePrompt']
            assert.strictEqual(
                writeStub.calledOnceWith('doNotShowPrompts', expectedResult, vscode.ConfigurationTarget.Global),
                true
            )
        })

        it('does not update if alreay included', async function () {
            sandbox.stub(sut, 'readSetting').returns(testResponseIncluded)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptToAdd)
            assert.strictEqual(writeStub.notCalled, true)
        })

        it('replaces incorrect type with array and appends', async function () {
            sandbox.stub(sut, 'readSetting').returns(testResponseWrongType)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptToAdd)
            const expectedResult = ['fakePrompt']
            assert.strictEqual(
                writeStub.calledOnceWith('doNotShowPrompts', expectedResult, vscode.ConfigurationTarget.Global),
                true
            )
        })

        it('attempts to create new list if undefined is returned', async function () {
            sandbox.stub(sut, 'readSetting').returns(testResponseUndefined)
            const writeStub = sandbox.stub(sut, 'writeSetting').resolves()

            sut.disable(promptToAdd)
            const expectedResult = ['fakePrompt']
            assert.strictEqual(
                writeStub.calledOnceWith('doNotShowPrompts', expectedResult, vscode.ConfigurationTarget.Global),
                true
            )
        })
    })

    describe('shouldDisplayPrompt', async function () {
        const listOne = ['promptOne', 'promptTwo', 'promptThree']
        const listTwo = ['promptOne']
        const wrongType = {}
        const promptToRead = 'promptTwo'
        beforeEach(async function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(async function () {
            sandbox.restore()
        })

        it('returns false when found', async function () {
            sandbox.stub(sut, 'readSetting').returns(listOne)
            const actual = sut.shouldDisplayPrompt(promptToRead)
            assert.strictEqual(actual, false)
        })

        it('returns true when not found', async function () {
            sandbox.stub(sut, 'readSetting').returns(listTwo)
            const actual = sut.shouldDisplayPrompt(promptToRead)
            assert.strictEqual(actual, true)
        })

        it('defaults to true when setting has wrong type', async function () {
            sandbox.stub(sut, 'readSetting').returns(wrongType)
            const actual = sut.shouldDisplayPrompt(promptToRead)
            assert.strictEqual(actual, true)
        })
    })
})
