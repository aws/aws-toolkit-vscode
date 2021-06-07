/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createBackButton } from '../../../shared/ui/buttons'
import * as vscode from 'vscode'
import * as input from '../../../shared/ui/input'

describe('createInputBox', async function () {
    let testInput: input.DataInputBox | undefined

    afterEach(function () {
        if (testInput) {
            testInput.dispose()
            testInput = undefined
        }
    })

    it('Sets buttons', async function () {
        const buttons = [createBackButton()]

        testInput = input.createInputBox({ buttons }).inputBox

        assert.deepStrictEqual(testInput.buttons, buttons)
    })

    it('Sets Options', async function () {
        const options = {
            title: 'title',
            placeholder: 'placeholder',
            ignoreFocusOut: true,
        }

        testInput = input.createInputBox(options).inputBox

        assertInputBoxOptions(testInput, options)
    })

    it('Sets boolean Options to false values', async function () {
        const options = {
            ignoreFocusOut: false,
        }

        testInput = input.createInputBox(options).inputBox

        assertInputBoxOptions(testInput, options)
    })

    it('Does not set Options', async function () {
        testInput = input.createInputBox({}).inputBox

        assertInputBoxOptions(testInput, {})
    })

    function assertInputBoxOptions(
        actualInput: vscode.InputBox,
        expectedOptions: vscode.InputBoxOptions & input.AdditionalInputBoxOptions
    ) {
        assert.strictEqual(
            actualInput.title,
            expectedOptions.title,
            `InputBox title mismatch, expected ${expectedOptions.title}, got ${actualInput.title}`
        )

        assert.strictEqual(
            actualInput.placeholder,
            expectedOptions.placeholder,
            `InputBox placeholder mismatch, expected ${expectedOptions.placeholder}, got ${actualInput.placeholder}`
        )

        // vscode.window.createInputBox defaults ignoreFocusOut to true
        const expectedIgnoreFocusOut =
            expectedOptions.ignoreFocusOut !== undefined ? expectedOptions.ignoreFocusOut : true
        assert.strictEqual(
            actualInput.ignoreFocusOut,
            expectedIgnoreFocusOut,
            `InputBox ignoreFocusOut mismatch, expected ${expectedIgnoreFocusOut},` +
                ` got ${actualInput.ignoreFocusOut}`
        )

        // TODO : Test more options as they are added in the InputBox
    }
})

describe('promptUser', async function () {
    let sampleInput: TestInputBox

    beforeEach(async function () {
        sampleInput = new TestInputBox()
    })

    afterEach(async function () {
        sampleInput.dispose()
    })

    it('Accepted value is returned', async function () {
        const promptPromise = input.promptUser({
            inputBox: sampleInput,
        })

        sampleInput.accept('hello world')

        const promptResult: string | undefined = await promptPromise

        assert.ok(promptResult, 'Expected a non-undefined response')
        assert.strictEqual(promptResult, 'hello world', 'InputBox accepted value was not expected value')
    })

    it('Hide returns undefined', async function () {
        const promptPromise = input.promptUser({
            inputBox: sampleInput,
        })

        sampleInput.hide()

        const result = await promptPromise

        assert.strictEqual(result, undefined, `Expected calling hide() on prompt to return undefined, got ${result}`)
    })

    it('Button can cancel and return undefined', async function () {
        const buttonOfInterest = vscode.QuickInputButtons.Back
        sampleInput.buttons = [buttonOfInterest]

        const promptPromise = input.promptUser({
            inputBox: sampleInput,
            onDidTriggerButton: (button, resolve, reject) => {
                assert.strictEqual(
                    button,
                    buttonOfInterest,
                    `Expected button ${JSON.stringify(buttonOfInterest)} ` +
                        `but got button ${JSON.stringify(buttonOfInterest)}`
                )

                sampleInput.hide()
            },
        })

        sampleInput.pressButton(sampleInput.buttons[0])

        const result = await promptPromise
        assert.strictEqual(
            result,
            undefined,
            `Expected button calling hide() on prompt to return undefined, got ${result} `
        )
    })

    it('Button can return a value', async function () {
        const buttonOfInterest = vscode.QuickInputButtons.Back
        const expectedValue = 'hello world'
        sampleInput.buttons = [buttonOfInterest]

        const promptPromise = input.promptUser({
            inputBox: sampleInput,
            onDidTriggerButton: (button, resolve, reject) => {
                assert.strictEqual(
                    button,
                    buttonOfInterest,
                    `Expected button ${JSON.stringify(buttonOfInterest)} ` +
                        `but got button ${JSON.stringify(buttonOfInterest)}`
                )

                sampleInput.accept(expectedValue)
            },
        })

        sampleInput.pressButton(sampleInput.buttons[0])

        const promptResult = await promptPromise

        assert.ok(promptResult, 'Expected a non-undefined response')
        assert.strictEqual(promptResult, expectedValue, 'InputBox accepted value was not expected value')
    })

    it('Button can do something and leave input box open', async function () {
        const buttonOfInterest = vscode.QuickInputButtons.Back
        sampleInput.buttons = [buttonOfInterest]
        let handledButtonPress: boolean = false

        const promptUserPromise = input.promptUser({
            inputBox: sampleInput,
            onDidTriggerButton: (button, resolve, reject) => {
                assert.strictEqual(
                    button,
                    buttonOfInterest,
                    `Expected button ${JSON.stringify(buttonOfInterest)} ` +
                        `but got button ${JSON.stringify(buttonOfInterest)}`
                )

                // do something that is not accept/cancel
                handledButtonPress = true
            },
        })

        sampleInput.pressButton(buttonOfInterest)

        assert.strictEqual(handledButtonPress, true, 'Expected button handler to trigger')
        assert.strictEqual(sampleInput.isShowing, true, 'Expected input box to still be showing')

        // Cleanup - this is to satisfy the linter
        sampleInput.hide()
        await promptUserPromise
    })

    class TestInputBox implements vscode.InputBox {
        public value: string = ''
        public placeholder: string | undefined
        public password: boolean = false
        public readonly onDidChangeValue: vscode.Event<string>
        public readonly onDidAccept: vscode.Event<void>
        public readonly onDidHide: vscode.Event<void>
        public buttons: readonly vscode.QuickInputButton[] = []
        public readonly onDidTriggerButton: vscode.Event<vscode.QuickInputButton>
        public prompt: string | undefined
        public validationMessage: string | undefined
        public title: string | undefined
        public step: number | undefined
        public totalSteps: number | undefined
        public enabled: boolean = true
        public busy: boolean = false
        public ignoreFocusOut: boolean = false

        public isShowing: boolean = false

        private readonly onDidHideEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
        private readonly onDidAcceptEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
        private readonly onDidChangeValueEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter()
        private readonly onDidTriggerButtonEmitter: vscode.EventEmitter<
            vscode.QuickInputButton
        > = new vscode.EventEmitter()

        public constructor() {
            this.onDidHide = this.onDidHideEmitter.event
            this.onDidAccept = this.onDidAcceptEmitter.event
            this.onDidChangeValue = this.onDidChangeValueEmitter.event
            this.onDidTriggerButton = this.onDidTriggerButtonEmitter.event
        }

        public show(): void {
            this.isShowing = true
        }
        public hide(): void {
            this.onDidHideEmitter.fire()
            this.isShowing = false
        }
        public accept(value: string) {
            this.value = value
            this.onDidAcceptEmitter.fire()
            this.isShowing = false
        }
        public dispose(): void {}

        public pressButton(button: vscode.QuickInputButton) {
            this.onDidTriggerButtonEmitter.fire(button)
        }
    }
})
