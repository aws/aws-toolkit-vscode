/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { OutputChannelTransport } from '../../../shared/logger/outputChannelTransport'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('OutputChannelTransport', async () => {
    let outputChannel: MockOutputChannel

    beforeEach(async () => {
        outputChannel = new MockOutputChannel()
    })

    it('logs content', async () => {
        const loggedMessage = 'This is my logged message'
        const transport = new OutputChannelTransport({
            outputChannel,
        })

        // OutputChannel is logged to in async manner
        const waitForLoggedText = new Promise<void>(resolve => {
            outputChannel.onDidAppendText(loggedText => {
                if (loggedText === loggedMessage) {
                    resolve()
                }
            })
        })

        transport.log(
            {
                level: 'info',
                message: loggedMessage,
            },
            async () => {
                // Test will timeout if expected text is not encountered
                await waitForLoggedText
            }
        )
    })
})
