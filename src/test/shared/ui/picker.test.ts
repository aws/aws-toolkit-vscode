/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as picker from '../../../shared/ui/picker'
import { createBackButton, QuickInputButton } from '../../../shared/ui/buttons'
import { isValidResponse, PrompterButtons, PromptResult } from '../../../shared/ui/prompter'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'

describe('createQuickPick', async function () {
    let testPicker: vscode.QuickPick<vscode.QuickPickItem> | undefined

    afterEach(function () {
        if (testPicker) {
            testPicker.dispose()
            testPicker = undefined
        }
    })

    it('Sets buttons', async function () {
        const buttons = [createBackButton()]
        testPicker = picker.createQuickPick([], { buttons }).quickPick

        assert.deepStrictEqual(testPicker.buttons, buttons)
    })

    it('Sets Options', async function () {
        const options = {
            title: 'title',
            placeholder: 'placeholder',
            matchOnDescription: true,
            matchOnDetail: true,
            ignoreFocusOut: true,
            value: 'test value',
        }
        testPicker = picker.createQuickPick([], options).quickPick

        assertPickerOptions(testPicker, options)
    })

    it('Sets boolean Options to false values', async function () {
        const options = {
            matchOnDescription: false,
            matchOnDetail: false,
            ignoreFocusOut: false,
        }
        testPicker = picker.createQuickPick([], options).quickPick

        assertPickerOptions(testPicker, options)
    })

    it('Sets Options to undefined values', async function () {
        const options = {}
        testPicker = picker.createQuickPick([], options).quickPick

        assertPickerOptions(testPicker, options)
    })

    it('Does not set Options', async function () {
        testPicker = picker.createQuickPick([], {}).quickPick
        assertPickerOptions(testPicker, {})
    })

    function assertPickerOptions(
        actualPicker: vscode.QuickPick<vscode.QuickPickItem>,
        expectedOptions: picker.ExtendedQuickPickOptions<any>
    ) {
        assert.strictEqual(
            actualPicker.title,
            expectedOptions.title,
            `Picker title mismatch, expected ${expectedOptions.title}, got ${actualPicker.title}`
        )

        assert.strictEqual(
            actualPicker.placeholder,
            expectedOptions.placeholder,
            `Picker placeholder mismatch, expected ${expectedOptions.placeholder}, got ${actualPicker.placeholder}`
        )

        // vscode.window.createQuickPick defaults matchOnDescription to true
        const expectedMatchOnDescription = getValueOrDefault(expectedOptions.matchOnDescription, true)
        assert.strictEqual(
            actualPicker.matchOnDescription,
            expectedMatchOnDescription,
            `Picker matchOnDescription mismatch, expected ${expectedMatchOnDescription},` +
                ` got ${actualPicker.matchOnDescription}`
        )

        // vscode.window.createQuickPick defaults matchOnDetail to true
        const expectedMatchOnDetail = getValueOrDefault(expectedOptions.matchOnDetail, true)
        assert.strictEqual(
            actualPicker.matchOnDetail,
            expectedMatchOnDetail,
            `Picker matchOnDetail mismatch, expected ${expectedMatchOnDetail},` + ` got ${actualPicker.matchOnDetail}`
        )

        // vscode.window.createQuickPick defaults ignoreFocusOut to true
        const expectedIgnoreFocusOut = getValueOrDefault(expectedOptions.ignoreFocusOut, true)
        assert.strictEqual(
            actualPicker.ignoreFocusOut,
            expectedIgnoreFocusOut,
            `Picker ignoreFocusOut mismatch, expected ${expectedIgnoreFocusOut},` +
                ` got ${actualPicker.ignoreFocusOut}`
        )

        // TODO : Test more options as they are added in the picker
    }

    function getValueOrDefault<T>(value: T | undefined, defaultValue: T) {
        if (value !== undefined) {
            return value
        }

        return defaultValue
    }
})

describe('QuickPickPrompter', async function () {
    let samplePicker: TestQuickPick<number>
    let samplePrompter: picker.QuickPickPrompter<number>

    beforeEach(async function () {
        samplePicker = createSamplePicker()
        samplePrompter = new picker.QuickPickPrompter(samplePicker)
    })

    afterEach(async function () {
        samplePicker.dispose()
    })

    it('Accepted value is returned', async function () {
        const selectedItem = [samplePicker.items[0]]

        const promptPromise = samplePrompter.prompt()
        samplePicker.accept(selectedItem)

        assertPromptResultEquals(await promptPromise, selectedItem[0].data)
    })

    it('Hide returns undefined', async function () {
        const promptPromise = samplePrompter.prompt()

        samplePicker.hide()

        const result = await promptPromise

        assert.strictEqual(result, undefined, `Expected calling hide() on prompt to return undefined, got ${result}`)
    })

    it('Button can cancel and return undefined', async function () {
        const buttonOfInterest = createBackButton()
        samplePicker.buttons = [buttonOfInterest]

        const promptPromise = samplePrompter.prompt()

        samplePicker.pressButton(samplePicker.buttons[0])

        const result = await promptPromise
        assert.strictEqual(
            result,
            WIZARD_BACK,
            `Expected button calling hide() on prompt, got ${result} `
        )
    })

    it('Button can return a value', async function () {
        const buttonOutput = 5
        const buttonOfInterest: QuickInputButton<number> = {
            iconPath: '',
            onClick: resolve => resolve(buttonOutput)
        }
        samplePicker.buttons = [buttonOfInterest]

        const promptPromise = samplePrompter.prompt()

        samplePicker.pressButton(samplePicker.buttons[0])

        assertPromptResultEquals(await promptPromise, buttonOutput)
    })

    it('Button can do something and leave picker open', async function () {
        let handledButtonPress: boolean = false

        const buttonOfInterest: QuickInputButton<void> = {
            iconPath: '',
            onClick: () => handledButtonPress = true
        }

        samplePicker.buttons = [buttonOfInterest]
        const promptPromise = samplePrompter.prompt()

        samplePicker.pressButton(buttonOfInterest)

        assert.strictEqual(handledButtonPress, true, 'Expected button handler to trigger')
        assert.strictEqual(samplePicker.isShowing, true, 'Expected picker to still be showing')

        // Cleanup - this is to satisfy the linter
        samplePicker.hide()
        await promptPromise
    })

    it('Allows custom input as the first quick pick option', async function () {
        const userInput = '99'
        const inputLabel = 'Enter a number'
        samplePrompter.allowCustomUserInput(inputLabel, v => Number(v))
        const promptPromise = samplePrompter.prompt()
        samplePicker.value = userInput
        assert.strictEqual(samplePicker.items[0].label, inputLabel)
        samplePicker.accept()

        assert.strictEqual(await promptPromise, Number(userInput))
    })

    it('Remembers what the user chose', async function () {
        const selectedItem = [samplePicker.items[2]]

        const promptPromise = samplePrompter.prompt()
        samplePicker.accept(selectedItem)
        await promptPromise

        assert.strictEqual(samplePrompter.getLastResponse(), samplePicker.items[2], 'Last response was different was the selected item')
    })

    it('Can set the last selected item and choose a new one', async function () {
        const inputTransform = (v?: string) => v !== undefined ? v.length * v.length : 0
        const userInput = 'Hello, world!'
        const inputLabel = 'Enter a string'
        samplePrompter.allowCustomUserInput(inputLabel, inputTransform)
        const promptPromise = samplePrompter.prompt()
        samplePicker.value = userInput
        samplePicker.accept()
        const result = await promptPromise
        const lastPicked = samplePrompter.getLastResponse() as picker.DataQuickPickItem<number>
        assert.strictEqual(typeof lastPicked, 'object')
        assert.strictEqual(result, inputTransform(userInput))

        const newPicker = createSamplePicker()
        const newPrompter = new picker.QuickPickPrompter(newPicker)
        newPrompter.allowCustomUserInput(inputLabel, inputTransform)
        newPrompter.setLastResponse(lastPicked)
        const newPrompterPromise = newPrompter.prompt()
        assert.strictEqual(newPicker.activeItems[0].data, lastPicked.data, 'Custom response was not the first option')
        newPicker.accept([newPicker.items[1]])

        assert.strictEqual(await newPrompterPromise, samplePicker.items[1].data)
    })

    function assertPromptResultEquals<T>(
        actualResult: PromptResult<T>,
        expectedResult: T
    ) {
        assert.notStrictEqual(actualResult, undefined, 'Expected result to be not undefined')
        assert.ok(isValidResponse(actualResult), 'Expected result to not be a control signal')
        assert.strictEqual(actualResult, expectedResult, `Expected ${expectedResult}, got ${actualResult}`)
    }

    type PickerItem<T> = picker.DataQuickPickItem<T>
    class TestQuickPick<T, U extends PickerItem<T> = PickerItem<T>> implements picker.DataQuickPick<T> {
        private _value: string = ''
        public placeholder: string | undefined
        public readonly onDidChangeValue: vscode.Event<string>
        public readonly onDidAccept: vscode.Event<void>
        public readonly onDidHide: vscode.Event<void>
        public buttons: PrompterButtons<T> = []
        public readonly onDidTriggerButton: vscode.Event<vscode.QuickInputButton>
        public items: readonly U[] = []
        public canSelectMany: boolean = false
        public matchOnDescription: boolean = false
        public matchOnDetail: boolean = false
        public activeItems: readonly U[] = []
        public readonly onDidChangeActive: vscode.Event<U[]>
        public selectedItems: readonly U[] = []
        public readonly onDidChangeSelection: vscode.Event<U[]>
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
        private readonly onDidChangeActiveEmitter: vscode.EventEmitter<U[]> = new vscode.EventEmitter()
        private readonly onDidChangeSelectionEmitter: vscode.EventEmitter<U[]> = new vscode.EventEmitter()
        private readonly onDidTriggerButtonEmitter: vscode.EventEmitter<
            vscode.QuickInputButton
        > = new vscode.EventEmitter()

        public constructor() {
            this.onDidHide = this.onDidHideEmitter.event
            this.onDidAccept = this.onDidAcceptEmitter.event
            this.onDidChangeValue = this.onDidChangeValueEmitter.event
            this.onDidChangeActive = this.onDidChangeActiveEmitter.event
            this.onDidChangeSelection = this.onDidChangeSelectionEmitter.event
            this.onDidTriggerButton = this.onDidTriggerButtonEmitter.event
        }

        public show(): void {
            this.isShowing = true
        }
        public hide(): void {
            this.onDidHideEmitter.fire()
            this.isShowing = false
        }
        public accept(value?: U[]) {
            this.selectedItems = value ?? [this.items[0]]
            this.onDidAcceptEmitter.fire()
            this.isShowing = false
        }
        public dispose(): void {}

        public pressButton(button: vscode.QuickInputButton) {
            this.onDidTriggerButtonEmitter.fire(button)
        }

        public get value(): string { return this._value }
        public set value(value: string) {
            this._value = value
            this.onDidChangeValueEmitter.fire(value)
        }
    }

    function createSamplePicker(): TestQuickPick<number> {
        const pickerDialog = new TestQuickPick<number>()
        pickerDialog.items = [
            { label: 'item 1', data: 1 }, 
            { label: 'item 2', data: 2 }, 
            { label: 'item 3', data: 3 }, 
            { label: 'item 4', data: 4 }
        ]

        return pickerDialog
    }
})