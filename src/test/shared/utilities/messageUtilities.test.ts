/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { LocalizedString } from 'vscode-nls'
import { showConfirmationMessage, showViewLogsMessage, showOutputMessage } from '../../../shared/utilities/messages'
import { MockOutputChannel } from '../../mockOutputChannel'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe('messages', function () {
    describe('showConfirmationMessage', function () {
        const prompt = 'prompt' as LocalizedString
        const confirm = 'confirm' as LocalizedString
        const cancel = 'cancel' as LocalizedString

        it('confirms warning message when the user clicks confirm', async function () {
            const window = new FakeWindow({ message: { warningSelection: confirm } })

            const isConfirmed = await showConfirmationMessage({ prompt, confirm, cancel }, window)

            assert.strictEqual(window.message.warning, prompt)
            assert.strictEqual(isConfirmed, true)
        })

        it('cancels warning message when the user clicks cancel', async function () {
            const window = new FakeWindow({ message: { warningSelection: cancel } })

            const isConfirmed = await showConfirmationMessage({ prompt, confirm, cancel }, window)

            assert.strictEqual(window.message.warning, prompt)
            assert.strictEqual(isConfirmed, false)
        })
    })

    describe('showOutputMessage', function () {
        it('shows and appends line to output channel', function () {
            const outputChannel = new MockOutputChannel()
            showOutputMessage('message', outputChannel)

            assert.strictEqual(outputChannel.isFocused, false)
            assert.strictEqual(outputChannel.isShown, true)
            assert.strictEqual(outputChannel.value, 'message\n')
        })
    })

    describe('showErrorWithLogs', function () {
        const message = 'message' as LocalizedString

        it('shows error message with a button to view logs', async function () {
            const window = new FakeWindow({ message: { errorSelection: 'View Logs...' } })
            await showViewLogsMessage(message, window)
            assert.strictEqual(window.message.error, message)
        })
    })
})
