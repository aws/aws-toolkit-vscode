/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import assert from 'assert'
import { SharedFileTransport, flushIntervalMillis } from '../../../shared/logger/sharedFileTransport'
import { FileSystemCommon } from '../../../srcShared/fs'
import { stub, SinonStub } from 'sinon'
import { MESSAGE } from '../../../shared/logger/consoleLogTransport'
import { createTestFile } from '../../testUtil'
import { readFileSync } from 'fs'
import { sleep } from '../../../shared/utilities/timeoutUtils'

describe('SharedFileTransport', function () {
    let instance: SharedFileTransport
    let nextFunc: SinonStub<[], Promise<void>>
    let logFile: vscode.Uri

    beforeEach(async function () {
        logFile = await createTestFile('testLogFile.log')
        instance = new SharedFileTransport({ logFile })
        nextFunc = stub()
    })

    afterEach(async function () {
        await FileSystemCommon.instance.delete(logFile)
    })

    it('logs are written to file', async function () {
        // This test will write logs at different points in time,
        // and should all be in the log file at the end.

        instance.log({ level: 'info', message: 'hello', [MESSAGE]: 'a1' }, nextFunc)
        await sleep(flushIntervalMillis + 1) // wait a full flush interval

        instance.log({ level: 'info', message: 'hello', [MESSAGE]: 'a2' }, nextFunc)
        instance.log({ level: 'info', message: 'hello', [MESSAGE]: 'a3' }, nextFunc)
        await sleep(flushIntervalMillis + 1) // wait a full flush interval

        instance.log({ level: 'info', message: 'hello', [MESSAGE]: 'a4' }, nextFunc)
        instance.log({ level: 'info', message: 'hello', [MESSAGE]: 'a5' }, nextFunc)
        await sleep(flushIntervalMillis / 2) // wait half a flush interval

        const lastLog = instance.log({ level: 'info', message: 'hello', [MESSAGE]: 'a6' }, nextFunc)
        await lastLog // wait for the last log to be written to the file

        // assert all logs were written to file
        const actualText = readFileSync(logFile.fsPath, 'utf8')
        assert.strictEqual(actualText, 'a1\na2\na3\na4\na5\na6\n')
        assert.strictEqual(nextFunc.callCount, 6)
    })
})
