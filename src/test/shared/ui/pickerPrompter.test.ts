/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { createBackButton } from '../../../shared/ui/buttons'
import {
    createLabelQuickPick,
    createQuickPick,
    FilterBoxQuickPickPrompter,
    DataQuickPickItem,
    defaultQuickpickOptions,
    QuickPickPrompter,
    customUserInput,
} from '../../../shared/ui/pickerPrompter'
import { hasKey, isNonNullable } from '../../../shared/utilities/tsUtils'
import { WIZARD_BACK } from '../../../shared/wizards/wizard'
import { getTestWindow } from '../../shared/vscode/window'
import { TestQuickPick } from '../vscode/quickInput'

describe('createQuickPick', function () {
    const items: DataQuickPickItem<string>[] = [
        { label: 'item1', data: 'yes' },
        { label: 'item2', data: 'no' },
    ]

    it('applies default options', async function () {
        const prompter = createQuickPick([])
        const picker = prompter.quickPick

        Object.keys(picker).forEach(key => {
            const defaultValue = (defaultQuickpickOptions as Record<string, any>)[key]
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
        void prompter.prompt()
        assert.strictEqual(prompter.quickPick.busy, true)

        resolveItems(items)
        await itemsPromise

        assert.strictEqual(prompter.quickPick.busy, false)
        assert.deepStrictEqual(prompter.quickPick.items, items)
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
    let picker: TestQuickPick<DataQuickPickItem<number>>
    let testPrompter: QuickPickPrompter<number>

    beforeEach(function () {
        picker = getTestWindow().createQuickPick() as typeof picker
        picker.items = testItems
        testPrompter = new QuickPickPrompter(picker)
    })

    it('can select an item', async function () {
        picker.onDidShow(() => picker.acceptItem(testItems[0]))
        const result = testPrompter.prompt()
        assert.strictEqual(await result, testItems[0].data)
    })

    it('steps can be set', function () {
        testPrompter.setSteps(1, 2)
        assert.strictEqual(picker.step, 1)
        assert.strictEqual(picker.totalSteps, 2)
    })

    it('can handle back button', async function () {
        testPrompter.onDidShow(() => picker.pressButton(createBackButton()))
        assert.strictEqual(await testPrompter.prompt(), WIZARD_BACK)
    })

    it('can accept input from buttons', async function () {
        const testButton = { iconPath: vscode.Uri.parse(''), onClick: () => 5 }
        testPrompter.onDidShow(() => picker.pressButton(testButton))
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
        picker.onDidShow(() => {
            picker.pressButton(testButton)
            picker.acceptItem(testItems[0])
        })

        assert.strictEqual(await testPrompter.prompt(), testItems[0].data)
    })

    it('returns recent item', async function () {
        picker.onDidShow(() => picker.acceptItem(testItems[1]))
        const result = testPrompter.prompt()
        assert.strictEqual(await result, testItems[1].data)
        assert.strictEqual(testPrompter.recentItem, testItems[1])
    })

    it('can set recent item', async function () {
        testPrompter.recentItem = testItems[2]
        assert.deepStrictEqual(picker.activeItems, [testItems[2]])
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
        void testPrompter.clearAndLoadItems([])
        assert.deepStrictEqual(picker.items, [noItemsFoundItem])
    })

    it('does not show a `noItemsFound` item if busy', async function () {
        let resolveItems!: (items: DataQuickPickItem<number>[]) => void
        const itemsPromise = new Promise<DataQuickPickItem<number>[]>(resolve => (resolveItems = resolve))
        const noItemsFoundItem = { label: 'placeholder', data: 0 }

        testPrompter = new QuickPickPrompter(picker, { noItemsFoundItem })
        void testPrompter.clearAndLoadItems(itemsPromise)
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

    it('handles AsyncIterables that yield empty arrays', async function () {
        async function* generator() {
            for (const _ of testItems) {
                yield []
            }
        }
        const noItemsFoundItem = { label: 'placeholder', data: 0 }
        testPrompter = new QuickPickPrompter(picker, { noItemsFoundItem })

        await testPrompter.clearAndLoadItems(generator())
        assert.deepStrictEqual(testPrompter.quickPick.items, [noItemsFoundItem])
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

        picker.show()
        void testPrompter.clearAndLoadItems(generator())
        picker.hide()
        await new Promise(r => picker.onDidHide(r))
        unlock()
        await new Promise(r => setImmediate(r))
        picker.assertItems([testItems[0]])
        unlock()
        await new Promise(r => setImmediate(r))
        picker.assertItems([testItems[0]])
    })

    it('loads `recentlyUsed` items at the top', async function () {
        await testPrompter.loadItems([{ label: 'item4', data: 4, recentlyUsed: true }])
        assert.strictEqual(picker.items[0].label, 'item4')
        await testPrompter.loadItems([{ label: 'item5', data: 5 }])
        assert.strictEqual(picker.items[0].label, 'item4')
        assert.strictEqual(picker.items.length, 5)
    })
})

describe('FilterBoxQuickPickPrompter', function () {
    const testItems = [
        { label: 'item1', data: 0 },
        { label: 'item2', data: 1 },
        { label: 'item3', data: 2 },
    ]
    const filterBoxInputSettings = {
        label: 'Enter a number',
        transform: (resp: string) => Number.parseInt(resp),
        validator: (resp: string) => (Number.isNaN(Number.parseInt(resp)) ? 'NaN' : undefined),
    }
    const options = {
        filterBoxInputSettings: filterBoxInputSettings,
    }

    let picker: TestQuickPick<DataQuickPickItem<number>>
    let testPrompter: FilterBoxQuickPickPrompter<number>

    function loadAndPrompt(): ReturnType<typeof testPrompter.prompt> {
        return testPrompter.loadItems(testItems).then(() => testPrompter.prompt())
    }

    beforeEach(function () {
        picker = getTestWindow().createQuickPick() as typeof picker
        testPrompter = new FilterBoxQuickPickPrompter(picker, options)
    })

    it('adds a new item based off the filter box', async function () {
        const input = '123'

        picker.onDidShow(() => {
            picker.onDidChangeActive(items => {
                if (items[0]?.description !== undefined) {
                    picker.acceptItem(items[0])
                }
            })
            void picker.setFilter(input)
        })

        assert.strictEqual(await loadAndPrompt(), Number(input))
    })

    it('can handle additional items being added', async function () {
        const input = '456'

        picker.onDidShow(async () => {
            picker.onDidChangeActive(items => {
                if (items[0]?.description !== undefined) {
                    picker.acceptItem(items[0])
                }
            })

            void picker.setFilter(input)

            const newItems = [{ label: 'item4', data: 3 }]
            const newItemsPromise = Promise.resolve(newItems)

            await testPrompter.loadItems(newItems)
            await testPrompter.loadItems(newItemsPromise)
        })

        assert.strictEqual(await loadAndPrompt(), Number(input))
    })

    it('can accept custom input as a last response', async function () {
        const input = '123'

        picker.onDidShow(async () => {
            picker.onDidChangeActive(items => {
                if (items[0]?.description !== undefined) {
                    picker.acceptItem(items[0])
                }
            })

            testPrompter.recentItem = { data: customUserInput, description: input } as any
            void picker.setFilter(input)
        })

        assert.strictEqual(await loadAndPrompt(), Number(input))
    })

    it('validates the custom input', async function () {
        const input = 'not a number'

        picker.onDidShow(() => {
            const disposable = picker.onDidChangeActive(items => {
                const item = items[0]
                if (
                    isNonNullable(item) &&
                    item.description === input &&
                    item.detail?.includes('NaN') &&
                    hasKey(item, 'invalidSelection') &&
                    item.invalidSelection
                ) {
                    picker.onDidChangeActive(items => {
                        if (items.length > 0) {
                            picker.acceptItem(items[0])
                        }
                    })
                    picker.acceptItem(picker.items[0])
                    disposable.dispose()
                    void picker.setFilter()
                }
            })

            void picker.setFilter(input)
        })

        assert.strictEqual(await loadAndPrompt(), testItems[0].data)
    })
})
