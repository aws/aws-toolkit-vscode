/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { showConfirmationMessage, showViewLogsMessage, showOutputMessage } from '../../../shared/utilities/messages'
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
})
