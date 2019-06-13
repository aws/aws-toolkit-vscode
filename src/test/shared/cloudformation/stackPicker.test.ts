/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { CloudFormationStackPicker } from '../../../shared/cloudformation/stackPicker'
import { TestLogger } from '../../../shared/loggerUtils'
import { asyncGenerator } from '../../utilities/asyncGenerator'
import { MockQuickPick } from '../ui/mockQuickPick'

describe('CloudFormationStackPicker', async () => {
    class TestCloudFormationStackPicker extends CloudFormationStackPicker {
        public constructor(
            existingStacks: AsyncIterableIterator<CloudFormation.StackSummary>,
            public readonly mockPicker: MockQuickPick<vscode.QuickPickItem>
        ) {
            super(existingStacks)
        }

        protected createQuickPick(): vscode.QuickPick<vscode.QuickPickItem> {
            return this.mockPicker
        }
    }

    const sampleStacks: CloudFormation.StackSummary[] = [
        'stackA',
        'stackB',
        'stackC'
    ].map(makePlaceholderStackSummary)
    let stacks: AsyncIterableIterator<CloudFormation.StackSummary>
    let logger: TestLogger

    beforeEach(async () => {
        logger = await TestLogger.createTestLogger()
        stacks = asyncGenerator(sampleStacks)
        releaseSecondStack = false
    })

    afterEach(async () => {
        await logger.cleanupLogger()
    })

    it('returns expected value from picker', async () => {
        const quickPick = new MockQuickPick({
            onShow: async (sender) => {
                // wait for picker to have at least one entry
                while (sender.items.length === 0) {
                    await new Promise<any>(resolve => setTimeout(resolve, 10))
                }

                sender.accept([sender.items[0]])
            }
        })

        const picker = new TestCloudFormationStackPicker(stacks, quickPick)
        const result = await picker.prompt()

        assert.strictEqual(result, 'stackA', 'Unexpected stack name returned from picker')
    })

    it('returns PICKER_CANCELLED on cancel', async () => {
        const quickPick = new MockQuickPick({
            onShow: (sender) => { sender.hide() }
        })
        const picker = new TestCloudFormationStackPicker(stacks, quickPick)
        const result = await picker.prompt()

        assert.strictEqual(
            result,
            CloudFormationStackPicker.PICKER_CANCELLED,
            'Expected "Cancelled" result from picker'
        )
    })

    it('returns PICKER_CANCELLED on Back Button press', async () => {
        const quickPick = new MockQuickPick({
            onShow: (sender) => {
                sender.pressButton(vscode.QuickInputButtons.Back)
            }
        })
        const picker = new TestCloudFormationStackPicker(stacks, quickPick)
        const result = await picker.prompt()

        assert.strictEqual(
            result,
            CloudFormationStackPicker.PICKER_CANCELLED,
            'Expected "Cancelled" result from picker'
        )
    })

    let releaseSecondStack: boolean = false
    async function* delayedStackList(): AsyncIterableIterator<CloudFormation.StackSummary> {
        yield* [makePlaceholderStackSummary('firstStack')]

        // Wait for signal to send second stack
        while (!releaseSecondStack) {
            await new Promise<any>(resolve => setTimeout(resolve, 1))
        }

        yield* [makePlaceholderStackSummary('secondStack')]
    }

    it('has a busy notification while retrieving stacks', async () => {
        // Test has two stacks, we simulate retrieving the second stack
        const quickPick = new MockQuickPick({
            onShow: async (sender) => {

                assert.strictEqual(sender.busy, true, 'expected picker to have busy state')

                releaseSecondStack = true

                // wait for picker to have both entries
                while (sender.items.length !== 2) {
                    await new Promise<any>(resolve => setTimeout(resolve, 5))
                }

                assert.strictEqual(sender.busy, false, 'expected picker to have non-busy state')
                sender.hide()
            }
        })

        const picker = new TestCloudFormationStackPicker(delayedStackList(), quickPick)
        await picker.prompt()
    })
})

function makePlaceholderStackSummary(stackName: string): CloudFormation.StackSummary {
    return {
        StackName: stackName,
        CreationTime: new Date(),
        StackStatus: 'CREATE_COMPLETE'
    }
}
