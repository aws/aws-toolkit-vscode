/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import vscode from 'vscode'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { Logger } from '../../../shared/logger'
import { makeLogger } from '../../../shared/logger/activation'
import { WinstonToolkitLogger } from '../../../shared/logger/winstonToolkitLogger'

describe('makeLogger', function () {
    let tempFolder: string
    let testLogger: Logger | undefined

    before(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        const logPath = vscode.Uri.joinPath(vscode.Uri.file(tempFolder), 'log.txt')
        testLogger = makeLogger({ staticLogLevel: 'debug', logPaths: [logPath] })
    })

    after(async function () {
        if (testLogger && testLogger instanceof WinstonToolkitLogger) {
            testLogger.dispose()
        }

        testLogger = undefined
        await fs.remove(tempFolder)
    })

    it('creates a logger object', function () {
        assert.notStrictEqual(testLogger, undefined)
        assert.ok(testLogger instanceof WinstonToolkitLogger)
    })
})
