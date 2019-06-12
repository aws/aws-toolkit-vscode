/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { CloudFormationStackPrompt } from '../../../shared/cloudformation/stackPrompt'
import { MockInputBox } from '../ui/mockInputBox'

describe('CloudFormationStackPrompt', async () => {
    class TestCloudFormationStackPrompt extends CloudFormationStackPrompt {
        public constructor(
            existingStackNames: string[],
            public readonly mockInputBox: MockInputBox
        ) {
            super(existingStackNames)
        }

        protected createInputBox(): vscode.InputBox {
            return this.mockInputBox
        }
    }

    const stackNames: string[] = ['aaa', 'bbb']

    it('returns expected value from prompt', async () => {
        const inputBox = new MockInputBox({
            onShow: (sender) => {
                sender.accept('mystackname')
            }
        })

        const prompt = new TestCloudFormationStackPrompt(stackNames, inputBox)
        const result = await prompt.prompt()

        assert.strictEqual(result, 'mystackname', 'Unexpected stack name returned from prompt')
    })

    it('returns PROMPT_CANCELLED on cancel', async () => {
        const inputBox = new MockInputBox({
            onShow: (sender) => { sender.hide() }
        })
        const prompt = new TestCloudFormationStackPrompt(stackNames, inputBox)
        const result = await prompt.prompt()

        assert.strictEqual(
            result,
            CloudFormationStackPrompt.PROMPT_CANCELLED,
            'Expected "Cancelled" result from prompt'
        )
    })

    it('returns PROMPT_CANCELLED on Back Button press', async () => {
        const inputBox = new MockInputBox({
            onShow: (sender) => {
                sender.pressButton(vscode.QuickInputButtons.Back)
            }
        })
        const prompt = new TestCloudFormationStackPrompt(stackNames, inputBox)
        const result = await prompt.prompt()

        assert.strictEqual(
            result,
            CloudFormationStackPrompt.PROMPT_CANCELLED,
            'Expected "Cancelled" result from prompt'
        )
    })

    it('validates against existing stack names', async () => {
        const inputBox = new MockInputBox({
            onShow: (sender) => {
                assert.strictEqual(sender.validationMessage, undefined)
                sender.setValue(stackNames[0])
                assert.notStrictEqual(sender.validationMessage, undefined)

                // Close up the picker
                sender.hide()
            }
        })

        const prompt = new TestCloudFormationStackPrompt(stackNames, inputBox)
        await prompt.prompt()
    })
})
