/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { OutputChannelTransport, MESSAGE } from '../../../shared/logger/outputChannelTransport'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('OutputChannelTransport', async function () {
    let outputChannel: MockOutputChannel
    const ansiCode = '\u001B[31m'
    const loggedMessage1 = 'This is my logged message1'
    const loggedMessage2 = 'This is my logged message2'

    beforeEach(async function () {
        outputChannel = new MockOutputChannel()
    })

    it('logs content', async function () {
        await runTests(
            [loggedMessage1, `${ansiCode}${loggedMessage2}`],
            [loggedMessage1, `${ansiCode}${loggedMessage2}`],
            false
        )
    })

    it('strips ANSI codes from logged content (if told to)', async function () {
        await runTests([loggedMessage1, `${ansiCode}${loggedMessage2}`], [loggedMessage1, loggedMessage2], true)
    })

    async function runTests(logStrings: string[], outputText: string[], stripAnsi: boolean, timeout: number = 1000) {
        assert.ok(logStrings.length === outputText.length, 'Inputs are uneven')

        const targetMessages = new Map<string, (value: void | PromiseLike<void>) => void>()
        const transport = new OutputChannelTransport({
            outputChannel,
            stripAnsi,
        })

        // OutputChannel is logged to in async manner
        outputChannel.onDidAppendText(loggedText => {
            const res = targetMessages.get(loggedText)
            if (res) {
                targetMessages.delete(loggedText)
                res()
            } else {
                assert.ok(false, 'Logged unknown message')
            }
        })

        const promises: Promise<void>[] = []

        for (const text of outputText) {
            promises.push(
                new Promise<void>(resolve => {
                    targetMessages.set(`${text}\n`, resolve)
                })
            )
        }

        for (const text of logStrings) {
            transport.log(
                {
                    level: 'info',
                    message: text,
                    [MESSAGE]: text,
                },
                () => {}
            )
        }

        // timeout prevents test from taking forever on fail--1 second by default (success will take less time)
        await Promise.race([
            Promise.all(promises),
            new Promise((resolve, reject) => {
                setTimeout(reject, timeout)
            }),
        ])
        assert.strictEqual(targetMessages.size, 0, 'Did not find all entries')
    }
})
