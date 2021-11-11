/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { createBackButton } from '../../../shared/ui/buttons'
import {
    createLabelQuickPick,
    createQuickPick,
    FilterBoxQuickPickPrompter,
    DataQuickPick,
    DataQuickPickItem,
    DEFAULT_QUICKPICK_OPTIONS,
    QuickPickPrompter,
    CUSTOM_USER_INPUT,
} from '../../../shared/ui/pickerPrompter'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'
import { exposeEmitters, ExposeEmitters } from '../vscode/testUtils'
import { recentlyUsed } from '../../../shared/localizedText'
import { partialCached } from '../../../shared/utilities/collectionUtils'
import { createQuickPickTester, QuickPickTester } from './testUtils'

describe('createQuickPick', function () {
    const items: DataQuickPickItem<string>[] = [
        { label: 'item1', data: 'yes' },
        { label: 'item2', data: 'no' },
    ]

    it('applies default options', async function () {
        const prompter = createQuickPick([])
        const picker = prompter.quickPick

        Object.keys(picker).forEach(key => {
            const defaultValue = (DEFAULT_QUICKPICK_OPTIONS as Record<string, any>)[key]
            if (defaultValue !== undefined) {
                assert.strictEqual(picker[key as keyof vscode.QuickPick<any>], defaultValue)
            }
        })
    })

    it('creates a new prompter with options', async function () {
        const prompter = createQuickPick(items, { title: 'test' })
        assert.strictEqual(prompter.quickPick.title, 'test')
    })

    it('creates a new prompter when given a promise for items', async function () {
        let resolveItems!: (items: DataQuickPickItem<string>[]) => void
        const itemsPromise = new Promise<DataQuickPickItem<string>[]>(resolve => (resolveItems = resolve))
        const prompter = createQuickPick(itemsPromise)
        prompter.prompt()
        assert.strictEqual(prompter.pendingUpdate, true)

        resolveItems(items)
        await itemsPromise
        await new Promise(r => setTimeout(r))

        assert.strictEqual(prompter.pendingUpdate, false)
        assert.deepStrictEqual(prompter.quickPick.items, items)
    })

    it('adds a refresh button if using `itemLoader`', function (done) {
        const copy = [...items]
        const loader = partialCached(() => copy)
        const prompter = createQuickPick([], { itemLoader: loader })

        prompter.onDidShow(() => {
            const refresh = prompter.quickPick.buttons.find(b => b.tooltip === 'Refresh')

            if (refresh) {
                copy.push({ label: 'item3', data: 'maybe' })
                refresh.onClick?.(prompter)
                if (prompter.quickPick.items[2]?.label === 'item3') {
                    done()
                }
            } else {
                done(new Error('Could not find refresh button'))
            }
        })

        prompter.configure({ cache: {} })
        prompter.prompt()
    })

    it('creates a new prompter when given an AsyncIterable', async function () {
        let r1!: (v?: any) => void
        let r2!: (v?: any) => void
        const p1 = new Promise(r => (r1 = r))
        const p2 = new Promise(r => (r2 = r))

        async function* generator() {
            for (const item of items) {
                if (item === items[0]) {
                    await p1
                } else {
                    await p2
                }
                yield [item]
            }
        }

        const prompter = createQuickPick(generator())
        r1()
        await new Promise(r => setImmediate(r))
        assert.deepStrictEqual(prompter.quickPick.items, [items[0]])
        assert.strictEqual(prompter.quickPick.busy, true)
        r2()
        await new Promise(r => setImmediate(r))
        assert.deepStrictEqual(prompter.quickPick.items, items)
        assert.strictEqual(prompter.quickPick.busy, false)
    })
})

describe('createLabelQuickPick', function () {
    it('creates a new prompter using just labels', async function () {
        const labelItems = [{ label: 'name1' }, { label: 'name2' }]
        const prompter = createLabelQuickPick(labelItems)
        assert.deepStrictEqual(
            prompter.quickPick.items,
            labelItems.map(item => ({ label: item.label, data: item.label }))
        )
    })

    it('can use promises', async function () {
        const labelItems = [{ label: 'name1' }, { label: 'name2' }]
        const itemsPromise = Promise.resolve(labelItems)

        const prompter = createLabelQuickPick(itemsPromise)

        assert.strictEqual(prompter.quickPick.busy, true)
    })
})

describe('QuickPickPrompter', function () {
    const testItems = [
        { label: 'item1', data: 0 },
        { label: 'item2', data: 1 },
        { label: 'item3', data: 2 },
    ]
    let picker: ExposeEmitters<DataQuickPick<number>, 'onDidChangeValue' | 'onDidTriggerButton' | 'onDidHide'>
    let testPrompter: QuickPickPrompter<number>

    beforeEach(function () {
        picker = exposeEmitters(vscode.window.createQuickPick() as DataQuickPick<number>, [
            'onDidChangeValue',
            'onDidTriggerButton',
            'onDidHide',
        ])
        picker.items = testItems
        testPrompter = new QuickPickPrompter(picker)
    })

    it('can select an item', async function () {
        testPrompter.onDidShow(() => (picker.selectedItems = [testItems[0]]))
        const result = testPrompter.prompt()
        assert.strictEqual(await result, testItems[0].data)
    })

    it('steps can be set', function () {
        testPrompter.setSteps(1, 2)
        assert.strictEqual(picker.step, 1)
        assert.strictEqual(picker.totalSteps, 2)
    })

    it('can handle back button', async function () {
        testPrompter.onDidShow(() => picker.fireOnDidTriggerButton(createBackButton()))
        assert.strictEqual(await testPrompter.promptControl(), WIZARD_BACK)
    })

    it('can accept input from buttons', async function () {
        const testButton = { iconPath: vscode.Uri.parse(''), onClick: () => 5 }
        testPrompter.onDidShow(() => picker.fireOnDidTriggerButton(testButton))
        assert.strictEqual(await testPrompter.prompt(), 5)
    })

    it('can selectively enable input when loading', async function () {
        const p = testPrompter.loadItems(new Promise(r => setImmediate(() => r([]))), false)
        assert.strictEqual(testPrompter.quickPick.enabled, true)
        await p
        assert.strictEqual(testPrompter.quickPick.enabled, true)
    })

    it('does not close if button does not return anything', async function () {
        const testButton = { iconPath: vscode.Uri.parse(''), onClick: () => {} }
        testPrompter.onDidShow(() => {
            picker.fireOnDidTriggerButton(testButton)
            picker.selectedItems = [testItems[0]]
        })
        assert.strictEqual(await testPrompter.prompt(), testItems[0].data)
    })

    it('returns recent item', async function () {
        testPrompter.onDidShow(() => (picker.selectedItems = [testItems[1]]))
        const result = testPrompter.prompt()
        assert.strictEqual(await result, testItems[1].data)
        assert.strictEqual(testPrompter.recentItem, testItems[1])
    })

    it('can set recent item', async function () {
        testPrompter.recentItem = testItems[2]
        assert.deepStrictEqual(picker.activeItems, [testItems[2]])
    })

    it('puts `recentlyUsed` items at the top', function () {
        // setRecentItem() puts the item at the top of the list. #2148
        const item = { label: 'item4', data: 3, recentlyUsed: true }
        testPrompter.loadItems([item])
        assert.strictEqual(testPrompter.quickPick.items.length, 4)
        assert.deepStrictEqual(testPrompter.quickPick.items[0], { ...item, description: recentlyUsed })
    })

    it('encloses description suffix with parentheses if description exists', function () {
        const item = { label: 'item4', data: 3, recentlyUsed: true, description: 'foo' }
        testPrompter.loadItems([item])
        const expected = `foo (${recentlyUsed})`
        assert.deepStrictEqual(testPrompter.quickPick.items[0], { ...item, description: expected })
    })

    it('tries to recover recent item from partial data', async function () {
        testPrompter.recentItem = 2
        assert.deepStrictEqual(picker.activeItems, [testItems[2]])
    })

    it('shows first item if recent item does not exist', async function () {
        testPrompter.recentItem = { label: 'item4', data: 3 }
        assert.deepStrictEqual(picker.activeItems, [testItems[0]])
    })

    it('shows a `noItemsFound` item if no items are loaded', async function () {
        const noItemsFoundItem = { label: 'placeholder', data: 0 }
        testPrompter = new QuickPickPrompter(picker, { noItemsFoundItem })
        testPrompter.clearAndLoadItems([])
        assert.deepStrictEqual(picker.items, [noItemsFoundItem])
    })

    it('does not show a `noItemsFound` item if busy', async function () {
        let resolveItems!: (items: DataQuickPickItem<number>[]) => void
        const itemsPromise = new Promise<DataQuickPickItem<number>[]>(resolve => (resolveItems = resolve))
        const noItemsFoundItem = { label: 'placeholder', data: 0 }

        testPrompter = new QuickPickPrompter(picker, { noItemsFoundItem })
        testPrompter.clearAndLoadItems(itemsPromise)
        assert.strictEqual(picker.items.length, 0)
        assert.strictEqual(picker.busy, true)
        resolveItems(testItems)
    })

    it('shows an error item if a Promise fails to load things', async function () {
        const badPromise = Promise.reject(new Error('my error'))
        const errorItem = { label: 'error', data: 0 }
        testPrompter = new QuickPickPrompter(picker, { errorItem })
        await testPrompter.clearAndLoadItems(badPromise)
        assert.deepStrictEqual(picker.items, [{ detail: 'my error', ...errorItem }])
    })

    it('uses an error item callback if applicable', async function () {
        const badPromise = Promise.reject(new Error('my error'))
        const errorCallback = (err: Error) => ({ label: err.message, data: 0 })
        testPrompter = new QuickPickPrompter(picker, { errorItem: errorCallback })
        await testPrompter.clearAndLoadItems(badPromise)
        assert.deepStrictEqual(picker.items, [{ detail: 'my error', label: 'my error', data: 0 }])
    })

    it('handles AsyncIterables that return something', async function () {
        async function* generator() {
            for (const item of testItems.slice(0, -1)) {
                yield [item]
            }

            return testItems.slice(-1)
        }

        await testPrompter.clearAndLoadItems(generator())
        assert.strictEqual(picker.items.length, 3)
    })

    it('handles AsyncIterables that throw', async function () {
        const errorItem = { label: 'error', data: 0 }
        testPrompter = new QuickPickPrompter(picker, { errorItem })

        async function* generator() {
            for (const item of testItems.slice(0, -1)) {
                yield [item]
            }

            throw new Error('my error')
        }

        await testPrompter.clearAndLoadItems(generator())
        assert.strictEqual(picker.items.length, 3)
        assert.strictEqual(picker.items[picker.items.length - 1].detail, 'my error')
    })

    it('stops requesting from an AsyncIterable when hidden', async function () {
        let unlock!: () => void
        let lock = new Promise<void>(r => (unlock = r))
        async function* generator() {
            for (const item of testItems) {
                await lock
                yield [item]
                lock = new Promise<void>(r => (unlock = r))
            }
        }

        testPrompter.clearAndLoadItems(generator())
        picker.fireOnDidHide()
        unlock()
        await new Promise(r => setImmediate(r))
        assert.strictEqual(picker.items.length, 1)
        unlock()
        await new Promise(r => setImmediate(r))
        assert.strictEqual(picker.items.length, 1)
    })
})

describe('FilterBoxQuickPickPrompter', function () {
    const testItems = [
        { label: 'item1', data: 0 },
        { label: 'item2', data: 1 },
        { label: 'item3', data: 2 },
    ]
    const filterBoxInput = {
        label: 'Enter a number',
        transform: (resp: string) => Number.parseInt(resp),
        validator: (resp: string) => (Number.isNaN(Number.parseInt(resp)) ? 'NaN' : undefined),
    }

    let picker: ExposeEmitters<DataQuickPick<number>, 'onDidChangeValue' | 'onDidAccept'>
    let tester: QuickPickTester<number>
    let testPrompter: FilterBoxQuickPickPrompter<number>

    beforeEach(function () {
        if (vscode.version.startsWith('1.44')) {
            this.skip()
        }
        picker = exposeEmitters(vscode.window.createQuickPick() as DataQuickPick<number>, [
            'onDidChangeValue',
            'onDidAccept',
        ])
        testPrompter = new FilterBoxQuickPickPrompter(picker, { filterBoxInput })
        tester = createQuickPickTester(testPrompter)
        testPrompter.loadItems(testItems)
    })

    it('adds a new item based off the filter box', async function () {
        const input = '123'

        tester.setValue(input)
        tester.acceptItem(filterBoxInput.label)

        await tester.result(Number(input))
    })

    it('can handle additional items being added', async function () {
        const input = '456'

        tester.setValue(input)
        tester.addCallback(async () => {
            const newItems = [{ label: 'item4', data: 3 }]
            const newItemsPromise = Promise.resolve(newItems)

            await testPrompter.loadItems(newItems)
            await testPrompter.loadItems(newItemsPromise)
        })
        tester.acceptItem(filterBoxInput.label)

        await tester.result(Number(input))
    })

    it('can accept custom input as a last response', async function () {
        const input = '123'

        tester.addCallback(prompter => {
            prompter.recentItem = { data: CUSTOM_USER_INPUT, description: input } as any
            picker.fireOnDidChangeValue(picker.value)
        })
        tester.acceptItem(filterBoxInput.label)

        await tester.result(Number(input))
    })

    it('validates the custom input', async function () {
        const input = 'not a number'

        tester = createQuickPickTester(testPrompter, { forceEmits: true })
        tester.setValue(input)
        tester.acceptItem(filterBoxInput.label)
        tester.setValue(undefined)
        tester.acceptItem(testItems[0])

        await tester.result(testItems[0].data)
    })

    it('can handle async validation', async function () {
        const input = 'not a number'
        const validator = async (val: string) => {
            await new Promise(r => setImmediate(r))
            return filterBoxInput.validator(val)
        }
        const filterBox = { ...filterBoxInput, validator }

        const newPicker = vscode.window.createQuickPick() as DataQuickPick<number>
        testPrompter = new FilterBoxQuickPickPrompter(newPicker, { filterBoxInput: filterBox })
        tester = createQuickPickTester(testPrompter, { forceEmits: true })
        testPrompter.loadItems(testItems)

        tester.setValue(input)
        tester.addCallback(prompter => {
            assert.strictEqual(prompter.quickPick.items[0].detail, 'Checking...')
        })
        tester.setValue(undefined)
        tester.assertItems(testItems)
        tester.hide()

        await tester.result()
    })
})
