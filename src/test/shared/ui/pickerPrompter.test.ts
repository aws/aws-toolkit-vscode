/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
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
import { exposeEmitters, ExposeEmitters } from '../vscode/testUtils'

describe('createQuickPick', function () {
    const items: DataQuickPickItem<string>[] = [
        { label: 'item1', data: 'yes' },
        { label: 'item2', data: 'no' },
    ]

    it('applies default options', async function () {
        const prompter = createQuickPick([])
        const picker = prompter.quickPick

        Object.keys(DEFAULT_QUICKPICK_OPTIONS).forEach(key => {
            assert.strictEqual(picker[key as keyof vscode.QuickPick<any>], (DEFAULT_QUICKPICK_OPTIONS as any)[key])
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
        assert.strictEqual(prompter.quickPick.busy, true)
        assert.strictEqual(prompter.quickPick.enabled, false)

        resolveItems(items)
        await itemsPromise

        assert.strictEqual(prompter.quickPick.busy, false)
        assert.strictEqual(prompter.quickPick.enabled, true)
        assert.deepStrictEqual(prompter.quickPick.items, items)
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
        const itemsPromise = new Promise<vscode.QuickPickItem[]>(resolve => resolve(labelItems))

        const prompter = createLabelQuickPick(itemsPromise)
        prompter.prompt()

        assert.strictEqual(prompter.quickPick.busy, true)
        assert.strictEqual(prompter.quickPick.enabled, false)
    })
})

describe('QuickPickPrompter', function () {
    const testItems = [
        { label: 'item1', data: 0 },
        { label: 'item2', data: 1 },
        { label: 'item3', data: 2 },
    ]
    let picker: DataQuickPick<number>
    let testPrompter: QuickPickPrompter<number>

    beforeEach(function () {
        picker = vscode.window.createQuickPick() as any
        picker.items = testItems
        testPrompter = new QuickPickPrompter(picker)
    })

    it('can select an item', async function () {
        const result = testPrompter.prompt()
        picker.selectedItems = [testItems[0]]
        assert.strictEqual(await result, testItems[0].data)
    })

    it('steps can be set', async function () {
        testPrompter.setSteps(1, 2)
        assert.strictEqual(picker.step, 1)
        assert.strictEqual(picker.totalSteps, 2)
    })

    it('returns last response', async function () {
        const result = testPrompter.prompt()
        picker.selectedItems = [testItems[1]]
        assert.strictEqual(await result, testItems[1].data)
        assert.strictEqual(testPrompter.lastResponse, testItems[1])
    })

    it('can set last response', async function () {
        testPrompter.lastResponse = testItems[2]
        assert.deepStrictEqual(picker.activeItems, [testItems[2]])
    })

    it('shows first item if last response does not exist', async function () {
        testPrompter.lastResponse = { label: 'item4', data: 3 }
        assert.deepStrictEqual(picker.activeItems, [testItems[0]])
    })

    it('can set a new active selection', async function () {
        picker.onDidChangeActive(active => {
            if (active[0].data === testItems[2].data) {
                picker.selectedItems = active
            }
        })
        const result = testPrompter.prompt()
        testPrompter.selectItems(testItems[2])

        assert.strictEqual(await result, testItems[2].data)
    })
})

describe('FilterBoxQuickPickPrompter', function () {
    const TEST_TIMEOUT = 5000
    const testItems = [
        { label: 'item1', data: 0 },
        { label: 'item2', data: 1 },
        { label: 'item3', data: 2 },
    ]
    const filterBoxInputSettings = {
        label: 'Enter a number',
        transform: (resp: string) => Number.parseInt(resp),
    }

    let picker: ExposeEmitters<DataQuickPick<number>>
    let testPrompter: FilterBoxQuickPickPrompter<number>

    function addTimeout(): void {
        setTimeout(picker.hide.bind(picker), TEST_TIMEOUT)
    }

    function loadAndPrompt(): ReturnType<typeof testPrompter.prompt> {
        return testPrompter.loadItems(testItems).then(() => testPrompter.prompt())
    }

    beforeEach(function () {
        picker = exposeEmitters(vscode.window.createQuickPick() as any)
        testPrompter = new FilterBoxQuickPickPrompter(picker, filterBoxInputSettings)
        addTimeout()
    })

    it('adds a new item based off the filter box', async function () {
        const input = '123'

        picker.onDidChangeActive(items => {
            if (items[0].description !== undefined) {
                picker.selectedItems = [items[0]]
            } else {
                // Note: VSC 1.42 will _not_ fire the change value event when setting `picker.value`
                picker.value = input
                picker.fireOnDidChangeValue(input)
            }
        })

        assert.strictEqual(await loadAndPrompt(), Number(input))
    })

    it('can handle additional items being added', async function () {
        const input = '456'

        picker.onDidChangeActive(items => {
            if (picker.items.length !== 6) {
                picker.value = input
                picker.fireOnDidChangeValue(input)
                return
            }

            picker.selectedItems = [items[0]]
        })

        const result = loadAndPrompt()
        const newItems = [{ label: 'item4', data: 3 }]
        const newItemsPromise = Promise.resolve(newItems)

        testPrompter.loadItems(newItems)
        testPrompter.loadItems(newItemsPromise)

        assert.strictEqual(await result, Number(input))
    })

    it('can accept custom input as a last response', async function () {
        const input = '123'

        picker.onDidChangeActive(items => {
            if (items[0].description !== undefined) {
                picker.selectedItems = [items[0]]
            } else {
                testPrompter.lastResponse = { data: CUSTOM_USER_INPUT, description: input } as any
                picker.fireOnDidChangeValue(input)
            }
        })

        assert.strictEqual(await loadAndPrompt(), Number(input))
    })
})
