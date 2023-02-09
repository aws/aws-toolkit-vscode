/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// Common prompter testing utilities

import { AssertionError, deepStrictEqual } from 'assert'
import { QuickInputButton } from '../../../shared/ui/buttons'
import { DataQuickPickItem, QuickPickPrompter } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import { exposeEmitters } from '../vscode/testUtils'

type QuickPickTesterMethods<T> = {
    /**
     * Presses a button.
     * Can either use the exact button object or pass in a string to search for a tooltip.
     * The tooltip string must be an exact match.
     */
    pressButton(button: string | QuickInputButton<T>): void
    /**
     * Attempts to accept the given item.
     * If a string is given, then the item will be matched based off label. Otherwise a deep compare will be performed.
     * Only exact matches will be accepted.
     */
    acceptItem(item: string | DataQuickPickItem<T>): void
    /**
     * Asserts that the given items are loaded in the QuickPick, in the given order.
     * Must include all visible items. Filtered items will not be considered.
     */
    assertItems(items: string[] | DataQuickPickItem<T>[]): void
    /**
     * Asserts that the given items are loaded in the QuickPick, in the given order.
     * This can be a subset of the currently visible items.
     */
    assertContainsItems(...items: (string | DataQuickPickItem<T>)[]): void
    /**
     * Asserts that the items are currently selected. Not applicable to single-item pickers.
     * Order does not matter, but it must be the same items. Filtering is not applied.
     */
    assertSelectedItems(...items: (string | DataQuickPickItem<T>)[]): void
    /**
     * Asserts that the items are currently active.
     * Order does not matter, but it must be the same items.
     */
    assertActiveItems(...items: (string | DataQuickPickItem<T>)[]): void
    /**
     * Hides the picker.
     */
    hide(): void
    /**
     * Runs the given inputs and waits for the result or timeout.
     * Can optionally pass in an expected return value.
     *
     * This **must** be called and awaited, otherwise errors will not be surfaced correctly.
     */
    result(exptected?: PromptResult<T>): Promise<PromptResult<T>>
    /**
     * Executes the callback with a snapshot of the prompter in a given moment.
     *
     * This can be used for things such as setting up external state, asserting side-effects, or
     * inspecting the picker at test time.
     */
    addCallback(callback: (prompter?: QuickPickPrompter<T>) => Promise<any> | any): void
    /**
     * Sets the Quick Pick's filter. `undefined` removes any applied filters.
     *
     * This will affect what items are considered 'visible' by the tester depending on which
     * 'matchOn___' fields have been set in the picker.
     */
    setFilter(value?: string): void
}

export type QuickPickTester<T> = QuickPickTesterMethods<T> & QuickPickPrompter<T>

type Action<T> = {
    [P in keyof QuickPickTesterMethods<T>]: [P, Parameters<QuickPickTesterMethods<T>[P]>]
}[keyof QuickPickTesterMethods<T>]

interface TestOptions {
    /** Amount of time to wait per action before stopping the test. */
    timeout?: number
    // TODO: add formatting options?
}

const testDefaults: Required<TestOptions> = {
    timeout: 5000,
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
    prompter: QuickPickPrompter<T>,
    options: TestOptions = {}
): QuickPickTester<T> {
    type AssertionParams = ConstructorParameters<typeof AssertionError>[0]
    const actions: Action<T>[] = []
    const errors: Error[] = []
    const traces: AssertionParams[] = []
    const testPicker = exposeEmitters(prompter.quickPick, ['onDidAccept', 'onDidTriggerButton'])
    const resolvedOptions = { ...testDefaults, ...options }

    /* Waits until the picker is both enabled and not busy. */
    function whenReady(): Promise<void[]> {
        return Promise.all([
            new Promise<void>(r => {
                if (testPicker.enabled) {
                    return r()
                }

                const d = prompter.onDidChangeEnablement(e => e && d.dispose(), r())
            }),
            new Promise<void>(r => {
                if (!testPicker.busy) {
                    return r()
                }

                const d = prompter.onDidChangeBusy(e => !e && (d.dispose(), r()))
            }),
        ])
    }

    // 'activeItems' will change twice after applying a filter
    /* Waits until the filter has been applied to the picker */
    async function whenAppliedFilter(): Promise<void> {
        await new Promise<void>(r => {
            const d = testPicker.onDidChangeActive(() => (d.dispose(), r()))
        })
        await new Promise(r => setImmediate(r))
        await new Promise<void>(r => {
            const d = testPicker.onDidChangeActive(() => (d.dispose(), r()))
        })
    }

    /* Simulates the filtering of items. We do not have access to the picker's internal representation */
    function filterItems(): DataQuickPickItem<T>[] {
        const val = testPicker.value
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
        target: (string | DataQuickPickItem<T>)[]
    ): DataQuickPickItem<T>[] {
        return source.filter(item => {
            const index = target.findIndex(t =>
                typeof t === 'string' ? item.label === t : JSON.stringify(item) === JSON.stringify(t)
            )
            if (index !== -1) {
                return (target = target.slice(0, index).concat(target.slice(index + 1)))
            }
        })
    }

    function throwErrorWithTrace(trace: AssertionParams, message: string, actual?: any, expected?: any) {
        errors.push(new AssertionError({ ...trace, message, actual, expected }))
        testPicker.hide()
    }

    /* Executes a test action. Immediately hides the picker on any error */
    async function executeAction(action: Action<T>, trace: AssertionParams): Promise<void> {
        const throwError = throwErrorWithTrace.bind(undefined, trace)

        function assertItems(actual: DataQuickPickItem<T>[], expected: (string | DataQuickPickItem<T>)[]): void {
            if (actual.length !== expected.length) {
                return throwError('Picker had different number of items')
            }

            actual.forEach((actualItem, index) => {
                const expectedItem = expected[index]
                const type = typeof expectedItem === 'string' ? 'label' : 'item'
                if (
                    (type === 'label' && actualItem.label !== expectedItem) ||
                    (type === 'item' && JSON.stringify(actualItem) !== JSON.stringify(expectedItem))
                ) {
                    const actual = type === 'item' ? actualItem : actualItem.label
                    throwError(`Unexpected ${type} found at index ${index}`, actual, expectedItem)
                }
            })
        }

        switch (action[0]) {
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
            case 'acceptItem': {
                const filteredItems = filterItems()
                const match = matchItems(filteredItems, [action[1][0]])
                if (match.length === 0) {
                    throwError(`Unable to find item: ${JSON.stringify(action[1][0])}`) // TODO: add ways to format
                }
                testPicker.selectedItems = match
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
            case 'addCallback': {
                try {
                    await action[1][0](prompter)
                } catch (err) {
                    throwError(`Callback threw: ${(err as Error).message}`)
                }
                break
            }
            case 'setFilter':
                testPicker.value = action[1][0] ?? ''
                await whenAppliedFilter()
                break
            case 'hide': {
                testPicker.hide()
                break
            }
        }
    }

    async function start(): Promise<void> {
        while (actions.length > 0) {
            const trace = traces.shift()!
            const timeout = setTimeout(() => throwErrorWithTrace(trace, 'Timed out'), resolvedOptions.timeout)
            await whenReady()
            await executeAction(actions.shift()!, trace)
            clearTimeout(timeout)
        }
    }

    async function result(expected?: PromptResult<T>): Promise<PromptResult<T>> {
        const result = await prompter.prompt()
        if (errors.length > 0) {
            // TODO: combine errors into a single one
            throw errors[0]
        }
        if (arguments.length > 0) {
            deepStrictEqual(result, expected)
        }
        return result
    }

    const withTrace = <T extends (...args: any[]) => any>(f: T, name: string) => {
        const traceWrapper = (...args: any[]) => {
            traces.push({ stackStartFn: traceWrapper, operator: name, message: name })
            f(...args)
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

    // initialize prompter
    prompter.onDidShow(start)

    return Object.assign(
        prompter,
        wrapTraces(
            {
                pressButton: button => actions.push(['pressButton', [button]]),
                acceptItem: item => actions.push(['acceptItem', [item]]),
                assertItems: items => actions.push(['assertItems', [items]]),
                assertContainsItems: (...items) => actions.push(['assertContainsItems', items]),
                assertSelectedItems: (...items) => actions.push(['assertSelectedItems', items]),
                assertActiveItems: (...items) => actions.push(['assertActiveItems', items]),
                addCallback: callback => actions.push(['addCallback', [callback]]),
                setFilter: value => actions.push(['setFilter', [value]]),
                hide: () => actions.push(['hide', []]),
                result,
            } as QuickPickTesterMethods<T>,
            ['result', 'hide']
        )
    )
}
