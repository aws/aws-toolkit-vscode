/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    showConfirmationMessage,
    showViewLogsMessage,
    showOutputMessage,
    showMessageWithCancel,
} from '../../../shared/utilities/messages'
import { Timeout } from '../../../shared/utilities/timeoutUtils'
import { getTestWindow } from '../../shared/vscode/window'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('messages', function () {
    describe('showConfirmationMessage', function () {
        const prompt = 'prompt'
        const confirm = 'confirm'
        const cancel = 'cancel'

        it('confirms warning message when the user clicks confirm', async function () {
            const isConfirmed = showConfirmationMessage({ prompt, confirm, cancel })
            await getTestWindow()
                .waitForMessage(prompt)
                .then(message => message.selectItem(confirm))

            assert.strictEqual(await isConfirmed, true)
        })

        it('cancels warning message when the user clicks cancel', async function () {
            const isConfirmed = showConfirmationMessage({ prompt, confirm, cancel })
            await getTestWindow()
                .waitForMessage(prompt)
                .then(message => message.selectItem(cancel))

            assert.strictEqual(await isConfirmed, false)
        })

        it('cancels warning message on close', async function () {
            const isConfirmed = showConfirmationMessage({ prompt, confirm, cancel })
            await getTestWindow()
                .waitForMessage(prompt)
                .then(message => message.close())

            assert.strictEqual(await isConfirmed, false)
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
        const message = 'message'

        it('shows error message with a button to view logs', async function () {
            getTestWindow().onDidShowMessage(m => m.selectItem('View Logs...'))
            await showViewLogsMessage(message)
            getTestWindow().getFirstMessage().assertError(message)
        })
    })

    describe('showMessageWithCancel, showProgressWithTimeout', function () {
        it('does not show if Timeout completes before "showAfterMs"', async function () {
            const msg = 'test message'
            const timeout = new Timeout(1) // Completes in 1 ms.
            void showMessageWithCancel(msg, timeout, 20)
            await assert.rejects(getTestWindow().waitForMessage(msg, 50))
        })

        it('shows after "showAfterMs"', async function () {
            const msg = 'test message'
            const timeout = new Timeout(9999) // Completes in 1 ms.
            void showMessageWithCancel(msg, timeout, 50)
            // timeout.cancel()  // Force complete.
            await getTestWindow()
                .waitForMessage(msg)
                .then(message => {
                    message.close()
                })
            timeout.cancel() // Cleanup.
        })
    })
})
