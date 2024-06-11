/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AssertionError } from 'assert'
import { toRecord } from '../../../shared/utilities/collectionUtils'
import { EventEmitters } from './testUtils'
import { isKeyOf, isNonNullable, keys } from '../../../shared/utilities/tsUtils'
import { captureEventOnce } from '../../testUtil'

/**
 * A list of events to be proxied on input boxes
 */
const inputEvents = ['onDidAccept', 'onDidChangeValue', 'onDidTriggerButton'] as const

/**
 * A list of events to be proxied on quick picks
 */
const pickerEvents = [
    'onDidAccept',
    'onDidChangeValue',
    'onDidTriggerButton',
    'onDidTriggerItemButton',
    // 'onDidChangeActive',
    // 'onDidChangeSelection',
    // 'onDidHide',
] as const

function untilReady(
    quickInput: vscode.QuickInput,
    extraEmitters: ReturnType<typeof createExtraEmitters>
): Promise<unknown[]> {
    return Promise.all([
        quickInput.enabled ? Promise.resolve() : captureEventOnce(extraEmitters.onDidChangeEnablement.event),
        !quickInput.busy ? Promise.resolve() : captureEventOnce(extraEmitters.onDidChangeBusy.event),
    ])
}

// 'activeItems' will change twice after applying a filter
/* Waits until the filter has been applied to the picker */
async function whenAppliedFilter(picker: vscode.QuickPick<vscode.QuickPickItem>): Promise<void> {
    await captureEventOnce(picker.onDidChangeActive)
    await new Promise(r => setImmediate(r))
    await captureEventOnce(picker.onDidChangeActive)
}

/* Simulates the filtering of items. We do not have access to the picker's internal representation */
function filterItems<T extends vscode.QuickPickItem>(picker: vscode.QuickPick<T>): T[] {
    const val = picker.value
    const filter = (item: T) => {
        if (!item.label.match(val)) {
            return (
                (picker.matchOnDescription && (item.description ?? '').match(val)) ||
                (picker.matchOnDetail && (item.detail ?? '').match(val))
            )
        }
        return true
    }
    return picker.items.filter(filter)
}

type ItemMatcher<T extends vscode.QuickPickItem> = string | RegExp | T
function matchItem<T extends vscode.QuickPickItem>(item: T, expected: ItemMatcher<T>): boolean {
    if (expected instanceof RegExp) {
        return expected.test(item.label)
    } else if (typeof expected === 'string') {
        return item.label === expected
    } else {
        return JSON.stringify(item) === JSON.stringify(expected)
    }
}

/* Returns all items from source that are in target. Strings are matched based off label. Items are only matched once. */
function matchItems<T extends vscode.QuickPickItem>(source: T[], ...expected: ItemMatcher<T>[]): T[] {
    return source.filter(item => {
        const index = expected.findIndex(t => matchItem(item, t))
        if (index !== -1) {
            expected.splice(index, 1)
        }
        return index !== -1
    })
}

type ItemButtonMatcher<B extends vscode.QuickInputButton = vscode.QuickInputButton> = string | RegExp | Partial<B>
function matchItemButton<T extends vscode.QuickInputButton>(item: T, expected: ItemButtonMatcher<T>): boolean {
    if (expected instanceof RegExp) {
        return expected.test(item.tooltip ?? '')
    } else if (typeof expected === 'string') {
        return item.tooltip === expected
    } else {
        return JSON.stringify(item) === JSON.stringify(expected)
    }
}

function matchItemButtons<T extends vscode.QuickInputButton>(source: T[], expected: ItemButtonMatcher<T>): T[] {
    return source.filter(item => matchItemButton(item, expected))
}

const throwError = (message: string, actual?: any, expected?: any) => {
    throw new AssertionError({ message, actual, expected })
}

function assertItems<T extends vscode.QuickPickItem>(actual: T[], expected: ItemMatcher<T>[]): void {
    if (actual.length !== expected.length) {
        return throwError('Picker had different number of items', actual, expected)
    }

    actual.forEach((actualItem, index) => {
        if (!matchItem(actualItem, expected[index])) {
            throwError(`Unexpected item found at index ${index}`, actual, expected[index])
        }
    })
}

function assertItemButtons<T extends vscode.QuickInputButton>(actual: T[], expected: ItemButtonMatcher<T>[]): void {
    if (actual.length !== expected.length) {
        return throwError('Item had different number of buttons', actual, expected)
    }

    actual.forEach((actualItem, index) => {
        if (!matchItemButton(actualItem, expected[index])) {
            throwError(`Unexpected item button found at index ${index}`, actual, expected[index])
        }
    })
}

function findButtonOrThrow(
    input: vscode.QuickPick<vscode.QuickPickItem> | vscode.InputBox,
    button: string | vscode.QuickInputButton
) {
    const target = typeof button === 'string' ? input.buttons.filter(b => b.tooltip === button)[0] : button
    if (target === undefined) {
        throwError(`Unable to find button: ${String(button)}`)
    }

    return target
}

function printMatcher<T extends vscode.QuickPickItem>(matcher: ItemMatcher<T>) {
    matcher instanceof RegExp
        ? matcher.source
        : typeof matcher === 'string'
        ? matcher
        : JSON.stringify(matcher, undefined, 4)
}

function findItemOrThrow<T extends vscode.QuickPickItem>(picker: vscode.QuickPick<T>, item: ItemMatcher<T>): T {
    const filteredItems = filterItems(picker)
    const match = matchItems(filteredItems, item)[0]
    if (match === undefined) {
        throwError(`Unable to find item: ${printMatcher(item)}`)
    }

    return match
}

function findItemButtonOrThrow<T extends vscode.QuickInputButton>(
    item: vscode.QuickPickItem,
    itemButton: ItemButtonMatcher<T>
) {
    const itemButtons = item.buttons ? [...item.buttons] : []
    const match = matchItemButtons(itemButtons, itemButton)[0]
    if (match === undefined) {
        throwError(`Unable to find item: ${printMatcher(item)}`)
    }

    return match
}

export class PickerTester<T extends vscode.QuickPickItem> {
    public readonly onDidShow = this.extraEmitters.onDidShow.event

    public constructor(
        private readonly picker: vscode.QuickPick<T>,
        private readonly triggers: Pick<EventEmitters<vscode.QuickPick<T>>, (typeof pickerEvents)[number]>,
        private readonly extraEmitters: ReturnType<typeof createExtraEmitters>
    ) {}

    /*
     * Waits until the picker is both enabled and not busy
     */
    public async untilReady(): Promise<void> {
        await untilReady(this.picker, this.extraEmitters)
    }

    /**
     * Presses a button.
     *
     * Can either use the exact button object or pass in a string to search for a tooltip.
     * The tooltip string must be an exact match.
     */
    public pressButton(button: string | vscode.QuickInputButton): void {
        this.triggers.onDidTriggerButton.fire(findButtonOrThrow(this.picker, button))
    }

    /**
     * Press the button of a specific quick pick item
     */
    public pressItemButton(item: ItemMatcher<T>, itemButton: ItemButtonMatcher) {
        const _item = findItemOrThrow(this.picker, item)
        const _itemButton = findItemButtonOrThrow(_item, itemButton)
        this.triggers.onDidTriggerItemButton.fire({ button: _itemButton, item: _item })
    }

    /**
     * Attempts to accept the given item.
     *
     * If a string is given, then the item will be matched based off label. Otherwise a deep compare will be performed.
     * Only exact matches will be accepted.
     */
    public acceptItem(item: ItemMatcher<T>): void {
        this.picker.selectedItems = [findItemOrThrow(this.picker, item)]
        this.triggers.onDidAccept.fire()
    }

    /**
     * Attempts to accept all given items.
     *
     * See {@link acceptItem}.
     */
    public acceptItems(...items: ItemMatcher<T>[]): void {
        this.picker.selectedItems = items.map(i => findItemOrThrow(this.picker, i))
        this.triggers.onDidAccept.fire()
    }

    /**
     * Asserts that the given items are loaded in the QuickPick, in the given order.
     *
     * Must include all visible items. Filtered items will not be considered.
     */
    public assertItems(items: ItemMatcher<T>[]): void {
        const filteredItems = filterItems(this.picker)
        assertItems(filteredItems, items)
    }

    /**
     * Asserts that the buttons of the given quick pick item exist.
     */
    public assertItemButtons<B extends vscode.QuickInputButton>(
        item: ItemMatcher<T>,
        itemButtons: ItemButtonMatcher<B>[]
    ) {
        const _item = findItemOrThrow(this.picker, item)
        const buttons = _item.buttons ? [..._item.buttons] : []
        assertItemButtons(buttons, itemButtons)
    }

    /**
     * Asserts that the given items are loaded in the QuickPick, in the given order.
     *
     * This can be a subset of the currently visible items.
     */
    public assertContainsItems(...items: ItemMatcher<T>[]): void {
        const filteredItems = filterItems(this.picker)
        const match = matchItems(filteredItems, ...items)
        // Check length here first for better error output
        if (match.length !== items.length) {
            return throwError(`Did not find all items`, match, items)
        }
        assertItems(match, items)
    }

    /**
     * Asserts that the items are currently selected.
     *
     * Not applicable to single-item pickers. Order does not matter, but it must be
     * the same items. Filtering is not applied.
     */
    public assertSelectedItems(...items: ItemMatcher<T>[]): void {
        // Filtered items can still be selected for multi-item pickers
        const sortedSelected = [...this.picker.selectedItems].sort((a, b) => a.label.localeCompare(b.label))
        const sortedExpected = [...items].sort((a, b) => {
            const labelA = typeof a === 'string' ? a : a instanceof RegExp ? a.source : a.label
            const labelB = typeof b === 'string' ? b : b instanceof RegExp ? b.source : b.label
            return labelA.localeCompare(labelB)
        })
        assertItems(sortedSelected, sortedExpected)
    }

    /**
     * Asserts that the items are currently active.
     *
     * Order does not matter, but it must be the same items.
     */
    public assertActiveItems(...items: ItemMatcher<T>[]): void {
        const filteredActive = filterItems(this.picker).filter(i => this.picker.activeItems.includes(i))
        const sortedActive = [...filteredActive].sort((a, b) => a.label.localeCompare(b.label))
        const sortedExpected = [...items].sort((a, b) => {
            const labelA = typeof a === 'string' ? a : a instanceof RegExp ? a.source : a.label
            const labelB = typeof b === 'string' ? b : b instanceof RegExp ? b.source : b.label
            return labelA.localeCompare(labelB)
        })
        assertItems(sortedActive, sortedExpected)
    }

    public findItemOrThrow(item: ItemMatcher<T>): T {
        return findItemOrThrow(this.picker, item)
    }

    /**
     * Sets the Quick Pick's filter. `undefined` removes any applied filters.
     *
     * This will affect what items are considered 'visible' by the tester depending on which
     * 'matchOn___' fields have been set in the picker.
     */
    public async setFilter(value?: string | undefined): Promise<void> {
        this.picker.value = value ?? ''

        await whenAppliedFilter(this.picker)
    }
}

function createExtraEmitters() {
    return {
        onDidShow: new vscode.EventEmitter<void>(),
        onDidChangeBusy: new vscode.EventEmitter<boolean>(),
        onDidChangeEnablement: new vscode.EventEmitter<boolean>(),
    }
}

export type TestQuickPick<T extends vscode.QuickPickItem = vscode.QuickPickItem> = vscode.QuickPick<T> &
    PickerTester<T> & {
        readonly visible: boolean
    }

export function createTestQuickPick<T extends vscode.QuickPickItem>(picker: vscode.QuickPick<T>): TestQuickPick<T> {
    const emitters = toRecord(pickerEvents, () => new vscode.EventEmitter<any>())
    const triggers = toRecord(pickerEvents, k => emitters[k].fire.bind(emitters[k]))
    const extraEmitters = createExtraEmitters()
    keys(emitters).forEach(key => picker[key](triggers[key]))

    const state = { visible: false }
    const tester = new PickerTester(picker, emitters, extraEmitters)
    return new Proxy(picker, {
        get: (target, prop: keyof TestQuickPick<T>, recv) => {
            if (isKeyOf(prop, emitters)) {
                return emitters[prop].event
            }
            if (isKeyOf(prop, tester)) {
                return tester[prop].bind(tester)
            }
            if (isKeyOf(prop, state)) {
                return state[prop]
            }
            if (prop === 'show') {
                return function () {
                    const val = target.show()
                    if (!state.visible) {
                        state.visible = true
                        extraEmitters.onDidShow.fire()
                    }
                    return val
                }
            }
            if (prop === 'hide') {
                return function () {
                    const val = target.hide()
                    state.visible = false
                    return val
                }
            }

            return Reflect.get(target, prop, recv)
        },
        set: (target, prop: keyof TestQuickPick<T>, val, recv) => {
            if (prop === 'busy' || prop === 'enabled') {
                const oldVal = Reflect.get(target, prop, recv)
                const didSet = Reflect.set(target, prop, val, recv)
                if (didSet && oldVal !== val) {
                    if (prop === 'busy') {
                        extraEmitters.onDidChangeBusy.fire(val)
                    } else if (prop === 'enabled') {
                        extraEmitters.onDidChangeEnablement.fire(val)
                    }
                }
                return didSet
            }
            return Reflect.set(target, prop, val, recv)
        },
        has: (target, prop) => {
            return isKeyOf(prop, emitters) || isKeyOf(prop, tester) || isKeyOf(prop, state) || Reflect.has(target, prop)
        },
    }) as TestQuickPick<T>
}

class InputBoxTester {
    public readonly onDidShow = this.extraEmitters.onDidShow.event

    public constructor(
        private readonly inputBox: vscode.InputBox,
        private readonly triggers: Pick<EventEmitters<vscode.InputBox>, (typeof inputEvents)[number]>,
        private readonly extraEmitters: ReturnType<typeof createExtraEmitters>
    ) {}

    /*
     * Waits until the input box is both enabled and not busy
     */
    public async untilReady(): Promise<void> {
        await untilReady(this.inputBox, this.extraEmitters)
    }

    /**
     * Presses a button.
     * Can either use the exact button object or pass in a string to search for a tooltip.
     * The tooltip string must be an exact match.
     */
    public pressButton(button: string | vscode.QuickInputButton): void {
        this.triggers.onDidTriggerButton.fire(findButtonOrThrow(this.inputBox, button))
    }

    /**
     * Sets the current value _and_ attempts accept the input.
     */
    public acceptValue(value: string): void {
        this.inputBox.value = value
        this.triggers.onDidChangeValue.fire(value)
        this.triggers.onDidAccept.fire()
    }
}

export type TestInputBox = vscode.InputBox &
    InputBoxTester & {
        readonly visible: boolean
    }

export function createTestInputBox(inputBox: vscode.InputBox): TestInputBox {
    const emitters = toRecord(inputEvents, () => new vscode.EventEmitter<any>())
    const triggers = toRecord(inputEvents, k => emitters[k].fire.bind(emitters[k]))
    const extraEmitters = createExtraEmitters()

    keys(emitters).forEach(key => inputBox[key](triggers[key]))

    const state = { visible: false }
    const tester = new InputBoxTester(inputBox, emitters, extraEmitters)
    return new Proxy(inputBox, {
        get: (target, prop: keyof TestInputBox, recv) => {
            if (isKeyOf(prop, emitters)) {
                return emitters[prop].event
            }
            if (isKeyOf(prop, tester)) {
                return tester[prop].bind(tester)
            }
            if (isKeyOf(prop, state)) {
                return state[prop]
            }
            if (prop === 'show') {
                return function () {
                    const val = target.show()
                    if (!state.visible) {
                        state.visible = true
                        extraEmitters.onDidShow.fire()
                    }
                    return val
                }
            }
            if (prop === 'hide') {
                return function () {
                    const val = target.hide()
                    state.visible = false
                    return val
                }
            }

            return Reflect.get(target, prop, recv)
        },
        set: (target, prop: keyof TestInputBox, val, recv) => {
            if (prop === 'busy' || prop === 'enabled') {
                const oldVal = Reflect.get(target, prop, recv)
                const didSet = Reflect.set(target, prop, val, recv)
                if (didSet && oldVal !== val) {
                    if (prop === 'busy') {
                        extraEmitters.onDidChangeBusy.fire(val)
                    } else if (prop === 'enabled') {
                        extraEmitters.onDidChangeEnablement.fire(val)
                    }
                }
                return didSet
            }
            if (prop === 'value') {
                const oldVal = Reflect.get(target, prop, recv)
                const didSet = Reflect.set(target, prop, val, recv)
                if (didSet && oldVal !== val) {
                    triggers.onDidChangeValue(val)
                }
                return didSet
            }
            return Reflect.set(target, prop, val, recv)
        },
    }) as TestInputBox
}

export function isTestInputBox(quickInput: TestInputBox | TestQuickPick | undefined): quickInput is TestInputBox {
    return isNonNullable(quickInput) && !isTestQuickPick(quickInput)
}

export function isTestQuickPick(quickInput: TestInputBox | TestQuickPick | undefined): quickInput is TestQuickPick {
    return isNonNullable(quickInput) && 'onDidShow' in quickInput && 'items' in quickInput
}
