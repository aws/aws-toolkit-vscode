/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createBackButton, QuickInputButton } from '../../../shared/ui/buttons'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'
import * as vscode from 'vscode'
import { createInputBox, defaultInputboxOptions, InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { exposeEmitters, ExposeEmitters } from '../vscode/testUtils'

describe('createInputBox', function () {
    it('creates a new prompter with options', async function () {
        const prompter = createInputBox({ title: 'test' })
        assert.strictEqual(prompter.inputBox.title, 'test')
    })

    it('applies default options', async function () {
        const prompter = createInputBox()
        const inputBox = prompter.inputBox

        Object.keys(defaultInputboxOptions).forEach(key => {
            assert.strictEqual(inputBox[key as keyof vscode.InputBox], (defaultInputboxOptions as any)[key])
        })
    })
})

describe('InputBoxPrompter', function () {
    let inputBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
    let testPrompter: InputBoxPrompter

    beforeEach(function () {
        inputBox = exposeEmitters(vscode.window.createInputBox(), [
            'onDidAccept',
            'onDidChangeValue',
            'onDidTriggerButton',
        ])
        testPrompter = new InputBoxPrompter(inputBox)
    })

    /** Sets the input box's value then fires an accept event */
    function accept(value: string): void {
        inputBox.value = value
        inputBox.fireOnDidAccept()
    }

    it('accepts user input', async function () {
        const result = testPrompter.prompt()
        accept('input')
        assert.strictEqual(await result, 'input')
    })

    it('steps can be set', async function () {
        testPrompter.setSteps(1, 2)
        assert.strictEqual(inputBox.step, 1)
        assert.strictEqual(inputBox.totalSteps, 2)
    })

    it('returns last response', async function () {
        const result = testPrompter.prompt()
        accept('input')
        assert.strictEqual(await result, 'input')
        assert.strictEqual(testPrompter.recentItem, 'input')
    })

    it('can set last response', async function () {
        testPrompter.recentItem = 'last response'
        assert.strictEqual(inputBox.value, 'last response')
    })

    describe('buttons', function () {
        it('back button returns control signal', async function () {
            const back = createBackButton()
            inputBox.buttons = [back]

            const result = testPrompter.prompt()
            inputBox.fireOnDidTriggerButton(back)

            assert.strictEqual(await result, WIZARD_BACK)
        })

        it('buttons can return values', async function () {
            const button: QuickInputButton<string> = {
                iconPath: vscode.Uri.parse(''),
                onClick: () => 'answer',
            }
            inputBox.buttons = [button]

            const result = testPrompter.prompt()
            inputBox.fireOnDidTriggerButton(button)

            assert.strictEqual(await result, 'answer')
        })

        it('buttons with void return type do not close the prompter', async function () {
            const button: QuickInputButton<void> = {
                iconPath: vscode.Uri.parse(''),
                onClick: () => {},
            }
            inputBox.buttons = [button]

            const result = testPrompter.prompt()
            inputBox.fireOnDidTriggerButton(button)
            accept('answer')

            assert.strictEqual(await result, 'answer')
        })
    })

    describe('validation', function () {
        it('will not accept input if validation message is showing', async function () {
            const result = testPrompter.prompt()
            inputBox.validationMessage = 'bad input'
            accept('hello')
            inputBox.validationMessage = undefined
            accept('goodbye')

            assert.strictEqual(await result, 'goodbye')
        })

        it('shows validation message and updates after accept', async function () {
            const validateInput = (resp: string) => (Number.isNaN(Number.parseInt(resp)) ? 'NaN' : undefined)
            testPrompter.setValidation(validateInput)
            const result = testPrompter.prompt()

            inputBox.fireOnDidChangeValue('hello')
            assert.strictEqual(inputBox.validationMessage, 'NaN')
            inputBox.fireOnDidChangeValue('100')
            assert.strictEqual(inputBox.validationMessage, undefined)
            accept('we cannot accept this message')
            accept('200')
            assert.strictEqual(await result, '200')
        })
    })
})
