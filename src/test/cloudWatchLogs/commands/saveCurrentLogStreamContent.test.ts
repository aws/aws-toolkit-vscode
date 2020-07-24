/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { saveCurrentLogStreamContent } from '../../../cloudWatchLogs/commands/saveCurrentLogStreamContent'
import { LogStreamRegistry } from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'
import { rmrf } from '../../../shared/filesystem'
import { fileExists, makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe.only('saveCurrentLogStreamContent', async () => {
    let tempDir: string

    beforeEach(async () => {
        tempDir = await makeTemporaryToolkitFolder()
    })

    afterEach(async () => {
        await rmrf(tempDir)
    })

    it('saves log content to a file', async () => {
        const logContent = 'shutdown is imminent'
        const filename = path.join(tempDir, 'bobLoblawsLawB.log')
        const fakeRegistry: LogStreamRegistry = ({
            getLogContent: (uri: vscode.Uri, formatting?: { timestamps?: boolean }) => {
                return logContent
            },
        } as any) as LogStreamRegistry

        await saveCurrentLogStreamContent(
            vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:g:s:r`),
            fakeRegistry,
            new FakeWindow({
                dialog: {
                    saveSelection: vscode.Uri.file(filename),
                },
            })
        )

        assert.ok(await fileExists(filename))
        assert.strictEqual(await readFileAsString(filename), logContent)
    })

    // TODO: Add test for fs.writeFile failure. Apparently `fs.chmod` doesn't work on Windows?
})
