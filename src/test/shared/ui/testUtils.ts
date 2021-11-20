/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// Common prompter testing utilities

import { AssertionError, deepStrictEqual } from 'assert'
import { QuickInputButton } from '../../../shared/ui/buttons'
import { InputBox, InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { DataQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import { QuickInputPrompter } from '../../../shared/ui/quickInput'
import { sleep } from '../../../shared/utilities/promiseUtilities'
import { ExposeEmitters, exposeEmitters } from '../vscode/testUtils'

export interface PrompterTester<T> {
    /**
     * Runs the given inputs and waits for the result or timeout.
     * Can optionally pass in an expected return value which is deeply compared with the result.
     *
     * This **must** be called and awaited, otherwise errors will not be surfaced correctly.
     */
    result(expected?: PromptResult<T>): Promise<PromptResult<T>>
}

interface QuickInputTesterMethods<T = any> extends PrompterTester<T> {
    /**
     * Presses a button.
     *
     * Can either use the exact button object or pass in a string to search for a tooltip.
     * The tooltip string must be an exact match.
     */
    pressButton(button: string | QuickInputButton<T>): this

    /**
     * Executes the callback with a snapshot of the prompter in a given moment.
     *
     * This can be used for things such as setting up external state, asserting side-effects, or
     * inspecting the picker at test time.
     */
    addCallback(callback: (prompter: QuickInputPrompter<T>) => Promise<any> | any): this

    /**
     * Sets the quick input's 'value' box. `undefined` removes any value and is equivalent to an empty string.
     *
     * For quick picks, this is equivalent to apply a filter and will affect what items are considered 'visible'
     * by the tester depending on which 'matchOn___' fields have been set in the picker.
     *
     * For input boxes, this is equivalent to applying an input.
     */
    setValue(value?: string): this

    /**
     * Asserts that the quick input has the expected current and total steps. Use 0/0 for no steps.
     */
    assertSteps(current: number, total: number): this

    /**
     * Asserts that the quick input has the expected title.
     */
    assertTitle(expected: string | RegExp): this

    /**
     * Asserts that the quick input has the expected value.
     */
    assertValue(expected: string | RegExp): this

    /**
     * Submits the currently stored state.
     *
     * For quick picks, this will accept the currently selected item(s). If no item is selected then an error is thrown.
     *
     * For input boxes, this accepts the current value.
     */
    submit(): this

    /**
     * Hides the quick input.
     */
    hide(): this
}

interface QuickPickTesterMethods<T> extends QuickInputTesterMethods<T> {
    /**
     * Attempts to accept the given item.
     * If a string is given, then the item will be matched based off label. Otherwise a deep compare will be performed.
     * Only exact matches will be accepted.
     */
    acceptItem(item: string | RegExp | DataQuickPickItem<T>): this

    /**
     * Asserts that the given items are loaded in the QuickPick, in the given order.
     * Must include all visible items. Filtered items will not be considered.
     */
    assertItems(items: (string | RegExp | DataQuickPickItem<T>)[]): this

    /**
     * Asserts that the given items are loaded in the QuickPick, in the given order.
     * This can be a subset of the currently visible items.
     */
    assertContainsItems(...items: (string | DataQuickPickItem<T>)[]): this

    /**
     * Asserts that the items are currently selected. Not applicable to single-item pickers.
     * Order does not matter, but it must be the same items. Filtering is not applied.
     */
    assertSelectedItems(...items: (string | DataQuickPickItem<T>)[]): this

    /**
     * Asserts that the items are currently active.
     * Order does not matter, but it must be the same items.
     */
    assertActiveItems(...items: (string | DataQuickPickItem<T>)[]): this

    /** */
    addCallback(callback: (prompter: QuickPickPrompter<T>) => Promise<any> | any): this
}

interface InputBoxTesterMethods<T = string> extends QuickInputTesterMethods<string> {
    /**
     * Asserts the presence of a validation message. Using `undefined` expects no validation message.
     */
    assertValidationMessage(expected: string | RegExp | undefined): this

    /**
     * Asserts the value of the `password` field on the input box.
     */
    assertPassword(expected: boolean): this

    /**
     * Asserts the value of the `prompt` field on the input box.
     */
    assertPrompt(expected: string | RegExp): this

    /** */
    addCallback(callback: (prompter: InputBoxPrompter) => Promise<any> | any): this
}

type BaseAction = [name: string, args: any[]]
interface Actionable<T extends BaseAction> {
    /**
     * Actions assigned to the tester. This can be re-used against other prompts.
     */
    readonly actions: T[]
    /**
     * Applies an array of actions to the tester.
     */
    applyActions(actions: T[]): void
}

export type QuickPickTester<T> = QuickPickTesterMethods<T> & QuickPickPrompter<T> & Actionable<QuickPickAction<T>>
export type InputBoxTester<T = string> = InputBoxTesterMethods<T> & InputBoxPrompter & Actionable<InputBoxAction<T>>

type QuickPickAction<T> = {
    [P in keyof QuickPickTesterMethods<T>]: [P, Parameters<QuickPickTesterMethods<T>[P]>]
}[keyof QuickPickTesterMethods<T>]

type InputBoxAction<T> = {
    [P in keyof InputBoxTesterMethods<T>]: [P, Parameters<InputBoxTesterMethods<T>[P]>]
}[keyof InputBoxTesterMethods<T>]

type Action<T> = QuickPickAction<T> | InputBoxAction<T>

interface TestOptions {
    /** Amount of time to wait per action before stopping the test. */
    timeout?: number
    /** Forcefully fire event emitters when they normally wouldn't. (default: false) */
    forceEmits?: boolean
    /** Ignores the input's `busy` flag when deciding if the UI is ready for an action. (default: false) */
    ignoreBusy?: boolean
    // TODO: add formatting options?
}

const TEST_DEFAULTS: Required<TestOptions> = {
    timeout: 2500,
    forceEmits: false,
    ignoreBusy: false,
}

/**
 * Inputbox equivalent to {@link createQuickPickTester}.
 *
 * @returns A {@link InputBoxTester}
 */
export function createInputBoxTester(prompter: QuickInputPrompter<string>, options: TestOptions = {}): InputBoxTester {
    if (!(prompter instanceof InputBoxPrompter)) {
        throw new Error('Prompter was not a input box')
    }
    return createQuickInputTester(prompter, options) as InputBoxTester
}

/**
 * Creates a tester for quick picks.
 *
 * Tests are constructed as a series of 'actions' that are executed sequentially. Any action that
 * fails will immediately stop the test. The first action will always occur after the prompter is
 * both visible and enabled. Actions will always wait until the prompter is not busy/disabled before
 * continuing.
 *
 * @param prompter Prompter to test.
 * @param options Additional test options.
 *
 * @returns A {@link QuickPickTester}
 */
export function createQuickPickTester<T>(
    prompter: QuickInputPrompter<T>,
    options: TestOptions = {}
): QuickPickTester<T> {
    if (!(prompter instanceof QuickPickPrompter)) {
        throw new Error('Prompter was not a quick pick.')
    }
    return createQuickInputTester(prompter, options) as QuickPickTester<T>
}

// TODO: split out the functionality in this function
// Input boxes and quick picks are essentially the same thing, however, this function is just way too big
// with too much going on.
function createQuickInputTester<T>(
    prompter: QuickPickPrompter<T> | InputBoxPrompter,
    options: TestOptions = {}
): QuickPickTester<T> | InputBoxTester {
    const actions: Action<T>[] = []
    const errors: Error[] = []
    const traces: AssertionError[] = []
    const resolvedOptions = { ...TEST_DEFAULTS, ...options }

    const quickInput = exposeEmitters(
        ((prompter as QuickPickPrompter<T>).quickPick ?? (prompter as InputBoxPrompter).inputBox) as unknown as
            | DataQuickPick<T>
            | InputBox,
        ['onDidAccept', 'onDidTriggerButton', 'onDidChangeValue']
    )
    const testPicker = quickInput as unknown as ExposeEmitters<
        DataQuickPick<T>,
        'onDidAccept' | 'onDidTriggerButton' | 'onDidChangeValue'
    >
    const testInputBox = quickInput as unknown as InputBox

    /* Waits until the picker is both enabled and not busy. */
    function whenReady(options: TestOptions): Promise<void[]> {
        return Promise.all([
            new Promise(r => {
                if (quickInput.enabled) {
                    return r()
                }

                const d = prompter.onDidChangeEnablement(e => e && (d.dispose(), r()))
            }),
            new Promise(r => {
                if (!quickInput.busy || options.ignoreBusy) {
                    return r()
                }

                const d = prompter.onDidChangeBusy(e => !e && (d.dispose(), r()))
            }),
            sleep(), // Make the test loop less aggressive against the UI
        ])
    }

    /* Simulates the filtering of items. We do not have access to the picker's internal representation */
    function filterItems(): DataQuickPickItem<T>[] {
        const val = quickInput.value
        const filter = (item: DataQuickPickItem<T>) => {
            if (!item.label.match(val)) {
                return (
                    (testPicker.matchOnDescription && (item.description ?? '').match(val)) ||
                    (testPicker.matchOnDetail && (item.detail ?? '').match(val))
                )
            }
            return true
        }
        return testPicker.items.filter(filter)
    }

    /* Returns all items from source that are in target. Strings are matched based off label. Items are only matched once. */
    function matchItems(
        source: DataQuickPickItem<T>[],
        target: (string | RegExp | DataQuickPickItem<T>)[]
    ): DataQuickPickItem<T>[] {
        return source.filter(item => {
            const index = target.findIndex(t =>
                typeof t === 'string'
                    ? item.label === t
                    : t instanceof RegExp
                    ? !!item.label.match(t)
                    : JSON.stringify(item) === JSON.stringify(t)
            )
            if (index !== -1) {
                return (target = target.slice(0, index).concat(target.slice(index + 1)))
            }
        })
    }

    /* Waits until the filter has been applied to the picker */
    async function whenAppliedFilter(): Promise<void> {
        if (prompter instanceof InputBoxPrompter) {
            return
        }

        await new Promise<void>(r => {
            const d1 = testPicker.onDidChangeValue(() => {
                const d2 = testPicker.onDidChangeActive(() => (d1.dispose(), d2.dispose(), r()))
            })
        })
    }

    function throwErrorWithTrace(trace: AssertionError, message: string, actual?: any, expected?: any) {
        errors.push(Object.assign(trace, { message, actual, expected }))
        testPicker.dispose()
    }

    /* Executes a test action. Immediately hides the picker on any error */
    async function executeAction(action: Action<T>, trace: AssertionError): Promise<void> {
        const throwError = throwErrorWithTrace.bind(undefined, trace)

        function assertItems(
            actual: DataQuickPickItem<T>[],
            expected: (string | RegExp | DataQuickPickItem<T>)[]
        ): void {
            if (actual.length !== expected.length) {
                if (typeof expected[0] === 'string') {
                    return throwError(
                        'Picker had different number of items',
                        actual.map(i => i.label),
                        expected
                    )
                }
                return throwError('Picker had different number of items', actual, expected)
            }

            actual.forEach((actualItem, index) => {
                const expectedItem = expected[index]
                const type =
                    typeof expectedItem === 'string' ? 'label' : expectedItem instanceof RegExp ? 'regexp' : 'item'
                if (
                    (type === 'label' && actualItem.label !== expectedItem) ||
                    (type === 'regexp' && !actualItem.label.match(expectedItem as RegExp)) ||
                    (type === 'item' && JSON.stringify(actualItem) !== JSON.stringify(expectedItem))
                ) {
                    const actual = type === 'item' ? actualItem : actualItem.label
                    throwError(`Unexpected ${type} found at index ${index}`, actual, expectedItem)
                }
            })
        }

        switch (action[0]) {
            // ----------- shared methods ----------- //
            case 'pressButton': {
                const target =
                    typeof action[1][0] === 'string'
                        ? testPicker.buttons.filter(b => b.tooltip === action[1][0])[0]
                        : action[1][0]
                if (target === undefined) {
                    throwError(`Unable to find button: ${action[1][0]}`)
                }
                testPicker.fireOnDidTriggerButton(target)
                break
            }
            case 'addCallback': {
                try {
                    await action[1][0](prompter as any)
                } catch (err) {
                    throwError(`Callback threw: ${(err as Error).message}`)
                }
                break
            }
            case 'setValue': {
                const filterApplied = whenAppliedFilter()
                testPicker.value = action[1][0] ?? ''
                await filterApplied
                if (resolvedOptions.forceEmits) {
                    testPicker.fireOnDidChangeValue(testPicker.value)
                }
                break
            }
            case 'assertSteps': {
                const [current, total] = action[1]
                if (quickInput.step !== current) {
                    throwError('Unexpected current step', quickInput.step, current)
                }
                if (quickInput.totalSteps !== total) {
                    throwError('Unexpected total steps', quickInput.totalSteps, total)
                }
                break
            }
            case 'assertTitle': {
                const expected = action[1][0]
                if (!(quickInput.title ?? '').match(expected)) {
                    throwError('Unexpected title', quickInput.title, expected)
                }
                break
            }
            case 'assertValue': {
                const expected = action[1][0]
                if (!(quickInput.value ?? '').match(expected)) {
                    throwError('Unexpected input value', quickInput.value, expected)
                }
                break
            }
            case 'submit': {
                quickInput.fireOnDidAccept()
                break
            }
            case 'hide': {
                testPicker.hide()
                break
            }

            // ----------- quick pick specific methods ----------- //
            case 'acceptItem': {
                const filteredItems = filterItems()
                const match = matchItems(filteredItems, [action[1][0]])
                if (match.length === 0) {
                    const currentItems = `Current items:\n${filteredItems.map(i => `\t${i.label}`).join('\n')}`
                    throwError(`Unable to find item: ${JSON.stringify(action[1][0])}\n\n${currentItems}`) // TODO: add ways to format
                }
                testPicker.selectedItems = match
                if (resolvedOptions.forceEmits) {
                    testPicker.fireOnDidAccept()
                }
                break
            }
            case 'assertItems': {
                const filteredItems = filterItems()
                assertItems(filteredItems, action[1][0])
                break
            }
            case 'assertContainsItems': {
                const filteredItems = filterItems()
                const match = matchItems(filteredItems, action[1])
                // Check length here first for better error output
                if (match.length !== action[1].length) {
                    return throwError(`Did not find all items`, match, action[1])
                }
                assertItems(match, action[1])
                break
            }
            case 'assertSelectedItems': {
                // Filtered items can still be selected for multi-item pickers
                const sortedSelected = [...testPicker.selectedItems].sort((a, b) => a.label.localeCompare(b.label))
                const sortedExpected = [...action[1]].sort((a, b) => {
                    const labelA = typeof a === 'string' ? a : a.label
                    const labelB = typeof b === 'string' ? b : b.label
                    return labelA.localeCompare(labelB)
                })
                assertItems(sortedSelected, sortedExpected)
                break
            }
            case 'assertActiveItems': {
                const filteredActive = filterItems().filter(i => testPicker.activeItems.includes(i))
                const sortedActive = [...filteredActive].sort((a, b) => a.label.localeCompare(b.label))
                const sortedExpected = [...action[1]].sort((a, b) => {
                    const labelA = typeof a === 'string' ? a : a.label
                    const labelB = typeof b === 'string' ? b : b.label
                    return labelA.localeCompare(labelB)
                })
                assertItems(sortedActive, sortedExpected)
                break
            }

            // ----------- input box specific methods ----------- //
            case 'assertValidationMessage': {
                const expected = action[1][0]
                if (expected === undefined && testInputBox.validationMessage !== undefined) {
                    throwError(`Validation message was not empty: ${testInputBox.validationMessage}`)
                } else if (!(testInputBox.validationMessage ?? '').match(expected!)) {
                    throwError('Unexpected validation message', testInputBox.validationMessage, expected)
                }
                break
            }
            case 'assertPrompt': {
                const expected = action[1][0]
                if (!(testInputBox.prompt ?? '').match(expected!)) {
                    throwError('Unexpected prompt', testInputBox.prompt, expected)
                }
                break
            }
            case 'assertPassword': {
                const expected = action[1][0]
                if (testInputBox.password !== expected) {
                    throwError('Unexpected password', testInputBox.password, expected)
                }
                break
            }
        }
    }

    const timeoutMessage = 'Timed out, did you forget to call `hide` or `acceptItem`?'

    async function start(): Promise<void> {
        while (actions.length > 0) {
            const trace = traces.shift()!
            const timeout = setTimeout(() => throwErrorWithTrace(trace, timeoutMessage), resolvedOptions.timeout)
            await whenReady(options)
            await executeAction(actions.shift()!, trace)
            clearTimeout(timeout)
        }
    }

    async function result(expected?: PromptResult<T>): Promise<PromptResult<T>> {
        const timeoutTime = resolvedOptions.timeout * (actions.length + 1)
        const result = await Promise.race([prompter.promptControl(), sleep(timeoutTime)])
        if (result === undefined) {
            const remaining = actions.map(a => a[0]).join(', ') || 'None'
            throw new Error(`Timed out without executing all actions. Remaining actions: ${remaining}`)
        }
        if (errors.length > 0) {
            // TODO: combine errors into a single one
            throw errors[0]
        }
        if (arguments.length > 0) {
            deepStrictEqual(result, expected)
        }
        return result as PromptResult<T>
    }

    const withTrace = <T extends (...args: any[]) => any>(f: T, name: string) => {
        const traceWrapper = (...args: any[]) => {
            traces.push(new AssertionError({ stackStartFn: traceWrapper, operator: name, message: name }))
            return f(...args)
        }
        return Object.defineProperty(traceWrapper, 'name', { value: name, configurable: true, writable: false })
    }

    /**
     * Remaps stack traces to point to the action that caused the test to fail.
     */
    function wrapTraces<T extends { [key: string]: any }>(obj: T, exclude: (keyof T)[] = []): T {
        Object.keys(obj).forEach(key => {
            if (obj[key] instanceof Function && exclude.indexOf(key) === -1) {
                Object.assign(obj, { [key]: withTrace(obj[key], key) })
            }
        })
        return obj
    }

    function push(...args: Action<T>): QuickPickTester<T> | InputBoxTester {
        actions.push(args)
        return tester
    }

    // set up start hooks
    prompter.onDidShow(start) // TODO: may want to add option to dispose of the UI element

    // TODO: can I generalize the concept of a proxy capturing arbitrary props and mapping them to handlers?
    const tester = Object.assign(
        prompter,
        wrapTraces(
            {
                pressButton: (button: QuickInputButton) => push('pressButton', [button]),
                acceptItem: item => push('acceptItem', [item]),
                assertItems: items => push('assertItems', [items]),
                assertContainsItems: (...items) => push('assertContainsItems', items),
                assertSelectedItems: (...items) => push('assertSelectedItems', items),
                assertActiveItems: (...items) => push('assertActiveItems', items),
                addCallback: (callback: any) => push('addCallback', [callback]),
                setValue: value => push('setValue', [value]),
                hide: () => push('hide', []),
                submit: () => push('submit', []),
                assertSteps: (current, total) => push('assertSteps', [current, total]),
                assertTitle: expected => push('assertTitle', [expected]),
                assertValue: expected => push('assertValue', [expected]),
                assertPrompt: expected => push('assertPrompt', [expected]),
                assertPassword: expected => push('assertPassword', [expected]),
                assertValidationMessage: expected => push('assertValidationMessage', [expected]),
                result,
            } as QuickPickTesterMethods<T> | InputBoxTester,
            ['result', 'hide']
        ),
        { actions, applyActions: (parts: Action<T>[]) => actions.push(...parts) }
    ) as QuickPickTester<T> | InputBoxTester

    return tester
}
