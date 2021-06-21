/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createBackButton, QuickInputButton } from '../../../shared/ui/buttons'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'
import * as vscode from 'vscode'
import { createInputBox, DEFAULT_INPUTBOX_OPTIONS, InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { TestInputBox } from './input.test' // TestInputBox will eventually be apart of this file

describe('createInputBox', function () {
    it('creates a new prompter with options', async function () {
        const prompter = createInputBox({ title: 'test' })
        assert.strictEqual(prompter.inputBox.title, 'test')
    })

    it('applies default options', async function () {
        const prompter = createInputBox()
        const inputBox = prompter.inputBox

        Object.keys(DEFAULT_INPUTBOX_OPTIONS).forEach(key => {
            assert.strictEqual(
                inputBox[key as keyof vscode.InputBox], 
                (DEFAULT_INPUTBOX_OPTIONS as any)[key]
            )
        })
    })
})

describe('InputBoxPrompter', function () {
    let inputBox: TestInputBox
    let testPrompter: InputBoxPrompter

    beforeEach(function () {
        inputBox = new TestInputBox()
        testPrompter = new InputBoxPrompter(inputBox)
    })

    it('accepts user input', async function () {
        const result = testPrompter.prompt()
        inputBox.accept('input')
        assert.strictEqual(await result, 'input')
    })

    it('steps can be set', async function () {
        testPrompter.setSteps(1, 2)
        assert.strictEqual(inputBox.step, 1)
        assert.strictEqual(inputBox.totalSteps, 2)
    })

    it('returns last response', async function () {
        const result = testPrompter.prompt()
        inputBox.accept('input')
        assert.strictEqual(await result, 'input')
        assert.strictEqual(testPrompter.getLastResponse(), 'input')
    })

    it('can set last response', async function () {
        testPrompter.setLastResponse('last response')
        assert.strictEqual(inputBox.value, 'last response')
    })

    // TODO: move these button tests somewhere else since they function
    // exactly the same as QuickPick buttons
    describe('buttons', function() {
        it('back button returns control signal', async function () {
            const back = createBackButton()
            inputBox.buttons = [back]
    
            const result = testPrompter.prompt()
            inputBox.pressButton(back)
    
            assert.strictEqual(await result, WIZARD_BACK)
        })
    
        it('buttons can return values', async function () {
            const button: QuickInputButton<string> = {
                iconPath: '',
                onClick: () => 'answer',
            }
            inputBox.buttons = [button]
    
            const result = testPrompter.prompt()
            inputBox.pressButton(button)
    
            assert.strictEqual(await result, 'answer')
        })
    
        it('buttons with void return type do not close the prompter', async function () {
            const button: QuickInputButton<void> = {
                iconPath: '',
                onClick: () => {},
            }
            inputBox.buttons = [button]
    
            const result = testPrompter.prompt()
            inputBox.pressButton(button)
            assert.ok(inputBox.isShowing)
            inputBox.accept('answer')
    
            assert.strictEqual(await result, 'answer')
        })
    })

    describe('validation', function () {
        it('will not accept input if validation message is showing', async function () {
            const result = testPrompter.prompt()
            inputBox.validationMessage = 'bad input'
            inputBox.accept('hello')
            assert.ok(inputBox.isShowing)
            inputBox.validationMessage = undefined
            inputBox.accept('goodbye')
    
            assert.strictEqual(await result, 'goodbye')
        })
    
        it('shows validation message and updates after accept', async function () {
            const validateInput = (resp: string) => Number.isNaN(Number.parseInt(resp)) ? 'NaN' : undefined
            testPrompter.setValidation(validateInput)
            const result = testPrompter.prompt()
    
            inputBox.value = 'hello'
            assert.strictEqual(inputBox.validationMessage, 'NaN')
            inputBox.value = '100'
            assert.strictEqual(inputBox.validationMessage, undefined)
            inputBox.validationMessage = 'this is not possible'
            inputBox.accept()
            assert.strictEqual(await result, '100')
        })
    })
})