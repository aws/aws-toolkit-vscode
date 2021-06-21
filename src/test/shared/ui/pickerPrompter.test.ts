/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'
import * as vscode from 'vscode'
import { createLabelQuickPick, createQuickPick, CustomQuickPickPrompter, DataQuickPick, DataQuickPickItem, DEFAULT_QUICKPICK_OPTIONS, QuickPickPrompter } from '../../../shared/ui/pickerPrompter'

describe('createQuickPick', function () {
    const items: DataQuickPickItem<string>[] = [
        { label: 'item1', data: 'yes' },
        { label: 'item2', data: 'no' }
    ]

    it('applies default options', async function () {
        const prompter = createQuickPick([])
        const picker = prompter.quickPick

        Object.keys(DEFAULT_QUICKPICK_OPTIONS).forEach(key => {
            assert.strictEqual(
                picker[key as keyof vscode.QuickPick<any>], 
                (DEFAULT_QUICKPICK_OPTIONS as any)[key]
            )
        })
    })

    it('creates a new prompter with options', async function () {
        const prompter = createQuickPick(items, { title: 'test' })
        assert.strictEqual(prompter.quickPick.title, 'test')
    })

    it('creates a new prompter when given a promise for items', async function () {
        let resolveItems!: (items: DataQuickPickItem<string>[]) => void
        const itemsPromise = new Promise<DataQuickPickItem<string>[]>(resolve => resolveItems = resolve)
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

    it('promise that returns undefined causes prompter to hide', async function () {
        let resolveItems!: (items: DataQuickPickItem<string>[] | undefined) => void
        const itemsPromise = new Promise<DataQuickPickItem<string>[] | undefined>(resolve => resolveItems = resolve)
        const prompter = createQuickPick(itemsPromise)
        prompter.prompt()

        const didHide = new Promise(resolve => prompter.quickPick.onDidHide(resolve))

        resolveItems(undefined)
        await itemsPromise
        return didHide
    })
})

describe('createLabelQuickPick', function() {
    it('creates a new prompter using just labels', async function () {
        const labelItems = [ { label: 'name1' }, { label: 'name2' } ]
        const prompter = createLabelQuickPick(labelItems)
        assert.deepStrictEqual(
            prompter.quickPick.items, 
            labelItems.map(item => ({ label: item.label, data: item.label }))
        )
    })

    it('can use promises', async function () {
        const labelItems = [ { label: 'name1' }, { label: 'name2' } ]
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
        { label: 'item3', data: 2 }
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
        assert.strictEqual(testPrompter.getLastResponse(), testItems[1])
    })

    it('can set last response', async function () {
        testPrompter.setLastResponse(testItems[2])
        assert.deepStrictEqual(picker.activeItems, [testItems[2]])
    })

    it('shows first item if last response does not exist', async function () {
        testPrompter.setLastResponse({ label: 'item4', data: 3 })
        assert.deepStrictEqual(picker.activeItems, [testItems[0]])
    })
})

describe('CustomQuickPickPrompter', function () {
    const testItems = [
        { label: 'item1', data: 0 },
        { label: 'item2', data: 1 },
        { label: 'item3', data: 2 }
    ]
    const customInputSettings = {
        label: 'Enter a number',
        transform: (resp: string) => Number.parseInt(resp),
    }

    let picker: DataQuickPick<number> 
    let testPrompter: CustomQuickPickPrompter<number>

    beforeEach(function () {
        picker = vscode.window.createQuickPick() as any
        picker.items = testItems
        testPrompter = new CustomQuickPickPrompter(
            picker, 
            customInputSettings.label, 
            customInputSettings.transform
        )
    })

    it('filter box adds new item', async function () {
        const result = testPrompter.prompt()
        picker.value = '123'

        const isShown = await waitUntil(
            async () => picker.activeItems.length === 1 && picker.activeItems[0].description === '123', 
            { timeout: 1000, interval: 10, truthy: true }
        )

        assert.ok(isShown)

        picker.selectedItems = [picker.activeItems[0]]

        assert.strictEqual(await result, 123)
    })

    it('handles promise for items', async function () {
        let resolveItems!: (items: DataQuickPickItem<number>[]) => void
        const itemsPromise = new Promise<DataQuickPickItem<number>[]>(resolve => resolveItems = resolve)
        const prompter = createQuickPick(itemsPromise, { customInputSettings })
        picker = prompter.quickPick
        const result = prompter.prompt()
        assert.strictEqual(prompter.quickPick.busy, true)
        assert.strictEqual(prompter.quickPick.enabled, false)
        
        const isShown = waitUntil(
            async () => picker.activeItems.length === 1 && picker.activeItems[0].description === '123', 
            { timeout: 1000, interval: 10, truthy: true }
        )
        
        resolveItems(testItems)
        await itemsPromise
        picker.value = '123'

        assert.ok(await isShown)

        picker.selectedItems = [picker.activeItems[0]]

        assert.strictEqual(await result, 123)
    })
})