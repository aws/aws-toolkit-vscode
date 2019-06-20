/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { BaseCloudFormationStacksLoader, CloudFormationStackPicker, } from '../../../shared/cloudformation/stackPicker'
import { TestLogger } from '../../../shared/loggerUtils'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { MockQuickPick } from '../ui/mockQuickPick'

describe('CloudFormationStackPicker', async () => {
    class TestCloudFormationStacksLoader extends BaseCloudFormationStacksLoader {
        public startLoad() {
            this.loadStartEmitter.fire()
        }

        public endLoad() {
            this.loadEndEmitter.fire()
        }

        public emitItems(...items: CloudFormation.StackSummary[]) {
            items.forEach(item => this.itemEmitter.fire(item))
        }

        public loadItems(items: CloudFormation.StackSummary[]) {
            this.startLoad()
            this.emitItems(...items)
            this.endLoad()
        }
    }

    class TestCloudFormationStackPicker extends CloudFormationStackPicker {
        public constructor(
            loader: TestCloudFormationStacksLoader,
            public readonly mockPicker: MockQuickPick<vscode.QuickPickItem>
        ) {
            super({
                emitter: loader,
                extensionContext: new FakeExtensionContext(),
            })
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
    let stackLoader: TestCloudFormationStacksLoader
    let logger: TestLogger

    beforeEach(async () => {
        logger = await TestLogger.createTestLogger()
        stackLoader = new TestCloudFormationStacksLoader()
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

        const picker = new TestCloudFormationStackPicker(stackLoader, quickPick)
        stackLoader.loadItems(sampleStacks)

        const result = await picker.prompt()

        assert.strictEqual(result.cancelled, false, 'Expected result to be not cancelled')
        assert.strictEqual(result.createStackButtonPressed, false, 'Did not expect stack button to be pressed')
        assert.strictEqual(result.inputText, 'stackA', 'Unexpected stack name returned from picker')
    })

    it('returns cancelled state on cancel', async () => {
        const quickPick = new MockQuickPick({
            onShow: (sender) => { sender.hide() }
        })
        const picker = new TestCloudFormationStackPicker(stackLoader, quickPick)
        stackLoader.loadItems(sampleStacks)

        const result = await picker.prompt()

        assert.strictEqual(result.cancelled, true, 'Expected result to be cancelled')
        assert.strictEqual(result.createStackButtonPressed, false, 'Did not expect stack button to be pressed')
        assert.strictEqual(result.inputText, undefined, 'Expected undefined inputText in result')
    })

    it('returns cancelled state on Back Button press', async () => {
        const quickPick = new MockQuickPick({
            onShow: (sender) => {
                sender.pressButton(vscode.QuickInputButtons.Back)
            }
        })
        const picker = new TestCloudFormationStackPicker(stackLoader, quickPick)
        stackLoader.loadItems(sampleStacks)

        const result = await picker.prompt()

        assert.strictEqual(result.cancelled, true, 'Expected result to be cancelled')
        assert.strictEqual(result.createStackButtonPressed, false, 'Did not expect stack button to be pressed')
        assert.strictEqual(result.inputText, undefined, 'Expected undefined inputText in result')
    })

    it('has a busy notification while retrieving stacks', async () => {
        // Test has two stacks, we simulate retrieving the second stack
        const quickPick = new MockQuickPick({
            onShow: async (sender) => {

                assert.strictEqual(sender.busy, true, 'expected picker to have busy state')

                stackLoader.emitItems(sampleStacks[0])
                stackLoader.emitItems(sampleStacks[1])

                assert.strictEqual(sender.busy, true, 'expected picker to have busy state')

                stackLoader.endLoad()

                // wait for picker to have both entries
                while (sender.items.length !== 2) {
                    await new Promise<any>(resolve => setTimeout(resolve, 5))
                }

                assert.strictEqual(sender.busy, false, 'expected picker to have non-busy state')
                sender.hide()
            }
        })

        const picker = new TestCloudFormationStackPicker(stackLoader, quickPick)
        stackLoader.startLoad()
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
