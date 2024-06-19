/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { createBackButton, QuickInputButton } from '../../../shared/ui/buttons'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'
import * as vscode from 'vscode'
import { createInputBox, defaultInputboxOptions, InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { TestInputBox } from '../vscode/quickInput'
import { getTestWindow } from '../../shared/vscode/window'

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
    let inputBox: TestInputBox
    let testPrompter: InputBoxPrompter

    beforeEach(function () {
        inputBox = getTestWindow().createInputBox() as typeof inputBox
        testPrompter = new InputBoxPrompter(inputBox)
    })

    it('accepts user input', async function () {
        const result = testPrompter.prompt()
        inputBox.acceptValue('input')
        assert.strictEqual(await result, 'input')
    })

    it('steps can be set', async function () {
        testPrompter.setSteps(1, 2)
        assert.strictEqual(inputBox.step, 1)
        assert.strictEqual(inputBox.totalSteps, 2)
    })

    it('returns last response', async function () {
        const result = testPrompter.prompt()
        inputBox.acceptValue('input')
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
            inputBox.pressButton(back)

            assert.strictEqual(await result, WIZARD_BACK)
        })

        it('buttons can return values', async function () {
            const button: QuickInputButton<string> = {
                iconPath: vscode.Uri.parse(''),
                onClick: () => 'answer',
            }
            inputBox.buttons = [button]

            const result = testPrompter.prompt()
            inputBox.pressButton(button)

            assert.strictEqual(await result, 'answer')
        })

        it('buttons with void return type do not close the prompter', async function () {
            const button: QuickInputButton<void> = {
                iconPath: vscode.Uri.parse(''),
                onClick: () => {},
            }
            inputBox.buttons = [button]

            const result = testPrompter.prompt()
            inputBox.pressButton(button)
            inputBox.acceptValue('answer')

            assert.strictEqual(await result, 'answer')
        })
    })

    describe('validation', function () {
        it('will not accept input if validation message is showing', async function () {
            const result = testPrompter.prompt()
            inputBox.validationMessage = 'bad input'
            inputBox.acceptValue('hello')
            inputBox.validationMessage = undefined
            inputBox.acceptValue('goodbye')

            assert.strictEqual(await result, 'goodbye')
        })

        it('shows validation message and updates after accept', async function () {
            const validateInput = (resp: string) => (Number.isNaN(Number.parseInt(resp)) ? 'NaN' : undefined)
            testPrompter.setValidation(validateInput)
            const result = testPrompter.prompt()
            inputBox.acceptValue('hello')
            assert.strictEqual(inputBox.validationMessage, 'NaN')
            inputBox.value = '100'
            assert.strictEqual(inputBox.validationMessage, undefined)
            inputBox.acceptValue('we cannot accept this message')
            inputBox.acceptValue('200')
            assert.strictEqual(await result, '200')
        })

        it('passes isFinalInput', async function () {
            function validateInput(resp: string, isFinalInput?: boolean) {
                if (!isFinalInput) {
                    return 'user is typing'
                }
                return undefined
            }
            testPrompter.setValidation(validateInput)
            const result = testPrompter.prompt()

            // NOT final input.
            inputBox.value = 'hello'
            assert.strictEqual(inputBox.validationMessage, 'user is typing')
            // Final input (user confirmed / hit Enter).
            inputBox.acceptValue('hello')
            assert.strictEqual(inputBox.validationMessage, undefined)
            assert.strictEqual(await result, 'hello')
        })
    })
})
