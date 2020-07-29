/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as lolex from 'lolex'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as picker from '../../../shared/ui/picker'
import { IteratorTransformer } from '../../../shared/utilities/collectionUtils'

describe('createQuickPick', async () => {
    let testPicker: vscode.QuickPick<vscode.QuickPickItem> | undefined

    afterEach(() => {
        if (testPicker) {
            testPicker.dispose()
            testPicker = undefined
        }
    })

    it('Sets items', async () => {
        const items: vscode.QuickPickItem[] = [{ label: 'item one' }, { label: 'item two' }, { label: 'item triangle' }]

        testPicker = picker.createQuickPick({
            items: items,
        })

        assert.deepStrictEqual(testPicker.items, items)
    })

    it('Sets item options', async () => {
        const items: vscode.QuickPickItem[] = [
            {
                label: 'label',
                detail: 'detail',
                alwaysShow: true,
                description: 'description',
            },
        ]

        testPicker = picker.createQuickPick({ items: items })

        assert.deepStrictEqual(testPicker.items, items)
    })

    it('Sets buttons', async () => {
        const buttons: vscode.QuickInputButton[] = [vscode.QuickInputButtons.Back]

        testPicker = picker.createQuickPick({
            buttons: buttons,
        })

        assert.deepStrictEqual(testPicker.buttons, buttons)
    })

    it('Sets Options', async () => {
        const options = {
            title: 'title',
            placeHolder: 'placeholder',
            matchOnDescription: true,
            matchOnDetail: true,
            ignoreFocusOut: true,
            value: 'test value',
        }

        testPicker = picker.createQuickPick({
            options: options,
        })

        assertPickerOptions(testPicker, options)
    })

    it('Sets boolean Options to false values', async () => {
        const options = {
            matchOnDescription: false,
            matchOnDetail: false,
            ignoreFocusOut: false,
        }

        testPicker = picker.createQuickPick({
            options: options,
        })

        assertPickerOptions(testPicker, options)
    })

    it('Sets Options to undefined values', async () => {
        const options = {}

        testPicker = picker.createQuickPick({
            options: options,
        })

        assertPickerOptions(testPicker, options)
    })

    it('Does not set Options', async () => {
        testPicker = picker.createQuickPick({})

        assertPickerOptions(testPicker, {})
    })

    function assertPickerOptions(
        actualPicker: vscode.QuickPick<vscode.QuickPickItem>,
        expectedOptions: vscode.QuickPickOptions & picker.AdditionalQuickPickOptions
    ) {
        assert.strictEqual(
            actualPicker.title,
            expectedOptions.title,
            `Picker title mismatch, expected ${expectedOptions.title}, got ${actualPicker.title}`
        )

        assert.strictEqual(
            actualPicker.placeholder,
            expectedOptions.placeHolder,
            `Picker placeHolder mismatch, expected ${expectedOptions.placeHolder}, got ${actualPicker.placeholder}`
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

describe('promptUser', async () => {
    let samplePicker: TestQuickPick<vscode.QuickPickItem>

    beforeEach(async () => {
        samplePicker = createSamplePicker()
    })

    afterEach(async () => {
        samplePicker.dispose()
    })

    it('Accepted value is returned', async () => {
        const selectedItem = [samplePicker.items[0]]

        const promptPromise = picker.promptUser({
            picker: samplePicker,
        })

        samplePicker.accept(selectedItem)

        const promptResult: vscode.QuickPickItem[] | undefined = await promptPromise

        assertPromptResultEquals(promptResult, selectedItem)
    })

    it('Hide returns undefined', async () => {
        const promptPromise = picker.promptUser({
            picker: samplePicker,
        })

        samplePicker.hide()

        const result = await promptPromise

        assert.strictEqual(result, undefined, `Expected calling hide() on prompt to return undefined, got ${result}`)
    })

    it('Button can cancel and return undefined', async () => {
        const buttonOfInterest = vscode.QuickInputButtons.Back
        samplePicker.buttons = [buttonOfInterest]

        const promptPromise = picker.promptUser({
            picker: samplePicker,
            onDidTriggerButton: (button, resolve, reject) => {
                assert.strictEqual(
                    button,
                    buttonOfInterest,
                    `Expected button ${JSON.stringify(buttonOfInterest)} ` +
                        `but got button ${JSON.stringify(buttonOfInterest)}`
                )

                samplePicker.hide()
            },
        })

        samplePicker.pressButton(samplePicker.buttons[0])

        const result = await promptPromise
        assert.strictEqual(
            result,
            undefined,
            `Expected button calling hide() on prompt to return undefined, got ${result} `
        )
    })

    it('Button can return a value', async () => {
        const buttonOfInterest = vscode.QuickInputButtons.Back
        const selectedItem = [samplePicker.items[0]]
        samplePicker.buttons = [buttonOfInterest]

        const promptPromise = picker.promptUser({
            picker: samplePicker,
            onDidTriggerButton: (button, resolve, reject) => {
                assert.strictEqual(
                    button,
                    buttonOfInterest,
                    `Expected button ${JSON.stringify(buttonOfInterest)} ` +
                        `but got button ${JSON.stringify(buttonOfInterest)}`
                )

                samplePicker.accept(selectedItem)
            },
        })

        samplePicker.pressButton(samplePicker.buttons[0])

        const promptResult = await promptPromise

        assertPromptResultEquals(promptResult, selectedItem)
    })

    it('Button can do something and leave picker open', async () => {
        const buttonOfInterest = vscode.QuickInputButtons.Back
        samplePicker.buttons = [buttonOfInterest]
        let handledButtonPress: boolean = false

        const promptUserPromise = picker.promptUser({
            picker: samplePicker,
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

        samplePicker.pressButton(buttonOfInterest)

        assert.strictEqual(handledButtonPress, true, 'Expected button handler to trigger')
        assert.strictEqual(samplePicker.isShowing, true, 'Expected picker to still be showing')

        // Cleanup - this is to satisfy the linter
        samplePicker.hide()
        await promptUserPromise
    })

    function assertPromptResultEquals(
        actualResult: vscode.QuickPickItem[] | undefined,
        expectedResult: vscode.QuickPickItem[]
    ) {
        assert.notStrictEqual(actualResult, undefined, 'Expected result to be not undefined')

        const resultItems = actualResult as vscode.QuickPickItem[]

        assert.strictEqual(
            resultItems.length,
            expectedResult.length,
            `Expected result array of size ${expectedResult.length}, got ${resultItems.length}`
        )

        for (let i = 0; i < resultItems.length; i++) {
            assert.strictEqual(
                resultItems[i],
                expectedResult[i],
                `Expected ${expectedResult[i]}, got ${resultItems[i]} at element ${i}`
            )
        }
    }

    class TestQuickPick<T extends vscode.QuickPickItem> implements vscode.QuickPick<T> {
        public value: string = ''
        public placeholder: string | undefined
        public readonly onDidChangeValue: vscode.Event<string>
        public readonly onDidAccept: vscode.Event<void>
        public readonly onDidHide: vscode.Event<void>
        public buttons: readonly vscode.QuickInputButton[] = []
        public readonly onDidTriggerButton: vscode.Event<vscode.QuickInputButton>
        public items: readonly T[] = []
        public canSelectMany: boolean = false
        public matchOnDescription: boolean = false
        public matchOnDetail: boolean = false
        public activeItems: readonly T[] = []
        public readonly onDidChangeActive: vscode.Event<T[]>
        public selectedItems: readonly T[] = []
        public readonly onDidChangeSelection: vscode.Event<T[]>
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
        private readonly onDidChangeActiveEmitter: vscode.EventEmitter<T[]> = new vscode.EventEmitter()
        private readonly onDidChangeSelectionEmitter: vscode.EventEmitter<T[]> = new vscode.EventEmitter()
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
        public accept(value: T[]) {
            this.selectedItems = value
            this.onDidAcceptEmitter.fire()
            this.isShowing = false
        }
        public dispose(): void {}

        public pressButton(button: vscode.QuickInputButton) {
            this.onDidTriggerButtonEmitter.fire(button)
        }
    }

    function createSamplePicker(): TestQuickPick<vscode.QuickPickItem> {
        const pickerDialog = new TestQuickPick<vscode.QuickPickItem>()
        pickerDialog.items = [{ label: 'item 1' }, { label: 'item 2' }, { label: 'item 3' }, { label: 'item 4' }]

        return pickerDialog
    }
})

describe('IteratingQuickPickController', async () => {
    const values = ['a', 'b', 'c']
    const result = [{ label: 'A' }, { label: 'B' }, { label: 'C' }]
    const errMessage = 'ahhhhhhhhh!!!'
    const interval = 30

    let quickPick: vscode.QuickPick<vscode.QuickPickItem>
    let clock: lolex.InstalledClock

    before(() => {
        clock = lolex.install()
    })

    after(() => {
        clock.uninstall()
    })

    beforeEach(() => {
        clock.reset()
        quickPick = picker.createQuickPick<vscode.QuickPickItem>({})
    })

    afterEach(() => {
        quickPick.dispose()
    })

    async function* iteratorFn(): AsyncIterator<string> {
        for (const [i, value] of values.entries()) {
            await new Promise(resolve => {
                clock.setTimeout(() => {
                    resolve()
                }, interval)
            })
            if (i === values.length - 1) {
                return value
            }
            yield value
        }
    }

    function converter(val: string): vscode.QuickPickItem[] {
        if (val) {
            return [{ label: val.toUpperCase() }]
        }

        return []
    }

    async function* errIteratorFn(): AsyncIterator<string> {
        throw new Error(errMessage)
        yield 'nope'
    }

    async function* blankIteratorFn(): AsyncIterator<string> {}

    it('appends a refresh button to the quickPick', () => {
        new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        assert.strictEqual(quickPick.buttons.length, 1)
        assert.strictEqual(quickPick.buttons[0], picker.IteratingQuickPickController.REFRESH_BUTTON)
    })

    it('returns iterated values on start and on reset', async () => {
        const controller = new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        controller.startRequests()

        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()

        controller.reset()
        controller.startRequests()

        await clock.nextAsync()
        new Promise(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 1)
                assert.deepStrictEqual(quickPick.items, [{ label: 'A' }])
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('does not return additional values if start is called on a finished iterator', async () => {
        const controller = new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        controller.startRequests()

        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()

        controller.startRequests()
        await clock.nextAsync()
        new Promise(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('pauses and restarts iteration', async () => {
        const controller = new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        // pause almost immediately. This should cause this to output a single item.
        controller.startRequests()
        new Promise(resolve => {
            setTimeout(() => {
                controller.pauseRequests()
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, [{ label: 'A' }], `items at pause are: ${quickPick.items}`)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()

        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, result, `items at end are: ${quickPick.items}`)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('appends an error item', async () => {
        const controller = new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => errIteratorFn(), converter)
        )

        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, [
                    {
                        ...picker.IteratingQuickPickController.ERROR_ITEM,
                        detail: errMessage,
                    },
                ])
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('appends a no items item', async () => {
        const controller = new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => blankIteratorFn(), converter)
        )

        controller.startRequests()
        await clock.nextAsync()
        new Promise(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, [picker.IteratingQuickPickController.NO_ITEMS_ITEM])
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('only appends values from the current refresh cycle', async () => {
        const controller = new picker.IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()

        new Promise(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    describe('iteratingOnDidTriggerButton', async () => {
        class fakeIteratingQuickPickController extends picker.IteratingQuickPickController<undefined> {
            public constructor(
                private readonly spy: sinon.SinonSpy,
                callback?: () => Promise<vscode.QuickPickItem[] | undefined>
            ) {
                super(
                    picker.createQuickPick({}),
                    new IteratorTransformer(
                        () => {
                            return {
                                next: async () => {
                                    return { value: undefined, done: true }
                                },
                            }
                        },
                        () => []
                    ),
                    callback
                )
            }
            public async reset(): Promise<void> {
                this.spy()
            }
        }

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('triggers a refresh and returns undefined', async () => {
            const spy = sandbox.spy()
            const controller = new fakeIteratingQuickPickController(spy)
            const out = await controller.iteratingOnDidTriggerButton(
                picker.IteratingQuickPickController.REFRESH_BUTTON,
                () => {},
                () => {}
            )
            assert.strictEqual(out, undefined)
            assert.ok(spy.calledOnce)
        })

        it('returns undefined if no override is provided', async () => {
            const spy = sandbox.spy()
            const controller = new fakeIteratingQuickPickController(spy)
            const out = await controller.iteratingOnDidTriggerButton(
                { iconPath: new vscode.ThemeIcon('squirrel') },
                () => {},
                () => {}
            )
            assert.strictEqual(out, undefined)
            assert.ok(spy.notCalled)
        })

        it('returns a value from the override function', async () => {
            const spy = sandbox.spy()
            const callback = async () => {
                return items
            }
            const controller = new fakeIteratingQuickPickController(spy, callback)
            const items: vscode.QuickPickItem[] = [{ label: 'asdf' }, { label: 'jkl;' }]
            const out = await controller.iteratingOnDidTriggerButton(
                { iconPath: new vscode.ThemeIcon('squirrel') },
                () => {},
                () => {}
            )
            assert.deepStrictEqual(out, items)
            assert.ok(spy.notCalled)
        })
    })
})
