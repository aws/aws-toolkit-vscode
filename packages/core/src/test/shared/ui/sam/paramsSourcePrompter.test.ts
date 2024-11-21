/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    createDeployParamsSourcePrompter,
    createSyncParamsSourcePrompter,
    ParamsSource,
} from '../../../../shared/ui/sam/paramsSourcePrompter'
import { DataQuickPickItem } from '../../../../shared/ui/pickerPrompter'

describe('createSyncParamsSourcePrompter', () => {
    it('should return a prompter with the correct items with no valid samconfig', () => {
        const expectedItems: DataQuickPickItem<ParamsSource>[] = [
            {
                label: 'Specify required parameters and save as defaults',
                data: ParamsSource.SpecifyAndSave,
            },
            {
                label: 'Specify required parameters',
                data: ParamsSource.Specify,
            },
        ]
        const prompter = createSyncParamsSourcePrompter(false)
        const quickPick = prompter.quickPick
        assert.strictEqual(quickPick.title, 'Specify parameter source for sync')
        assert.strictEqual(quickPick.placeholder, 'Press enter to proceed with highlighted option')
        assert.strictEqual(quickPick.items.length, 2)
        assert.deepStrictEqual(quickPick.items, expectedItems)
    })

    it('should return a prompter with the correct items with valid samconfig', () => {
        const expectedItems: DataQuickPickItem<ParamsSource>[] = [
            {
                label: 'Specify required parameters and save as defaults',
                data: ParamsSource.SpecifyAndSave,
            },
            {
                label: 'Specify required parameters',
                data: ParamsSource.Specify,
            },
            {
                label: 'Use default values from samconfig',
                data: ParamsSource.SamConfig,
            },
        ]
        const prompter = createSyncParamsSourcePrompter(true)
        const quickPick = prompter.quickPick
        assert.strictEqual(quickPick.title, 'Specify parameter source for sync')
        assert.strictEqual(quickPick.placeholder, 'Press enter to proceed with highlighted option')
        assert.strictEqual(quickPick.items.length, 3)
        assert.deepStrictEqual(quickPick.items, expectedItems)
    })
})

describe('createDeployParamsSourcePrompter', () => {
    it('should return a prompter with the correct items with no valid samconfig', () => {
        const expectedItems: DataQuickPickItem<ParamsSource>[] = [
            {
                label: 'Specify required parameters and save as defaults',
                data: ParamsSource.SpecifyAndSave,
            },
            {
                label: 'Specify required parameters',
                data: ParamsSource.Specify,
            },
        ]
        const prompter = createDeployParamsSourcePrompter(false)
        const quickPick = prompter.quickPick
        assert.strictEqual(quickPick.title, 'Specify parameter source for deploy')
        assert.strictEqual(quickPick.placeholder, 'Press enter to proceed with highlighted option')
        assert.strictEqual(quickPick.items.length, 2)
        assert.deepStrictEqual(quickPick.items, expectedItems)
    })

    it('should return a prompter with the correct items with valid samconfig', () => {
        const expectedItems: DataQuickPickItem<ParamsSource>[] = [
            {
                label: 'Specify required parameters and save as defaults',
                data: ParamsSource.SpecifyAndSave,
            },
            {
                label: 'Specify required parameters',
                data: ParamsSource.Specify,
            },
            {
                label: 'Use default values from samconfig',
                data: ParamsSource.SamConfig,
            },
        ]
        const prompter = createDeployParamsSourcePrompter(true)
        const quickPick = prompter.quickPick
        assert.strictEqual(quickPick.title, 'Specify parameter source for deploy')
        assert.strictEqual(quickPick.placeholder, 'Press enter to proceed with highlighted option')
        assert.strictEqual(quickPick.items.length, 3)
        assert.deepStrictEqual(quickPick.items, expectedItems)
    })
})
