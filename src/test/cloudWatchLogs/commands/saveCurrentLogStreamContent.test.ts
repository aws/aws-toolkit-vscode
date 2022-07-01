/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import { createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { saveCurrentLogStreamContent } from '../../../cloudWatchLogs/commands/saveCurrentLogStreamContent'
import { LogStreamRegistry } from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { fileExists, makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe('saveCurrentLogStreamContent', async function () {
    const logContent = 'shutdown is imminent'
    let filename: string
    let fakeRegistry: LogStreamRegistry
    let tempDir: string

    beforeEach(async function () {
        tempDir = await makeTemporaryToolkitFolder()
        filename = path.join(tempDir, 'bobLoblawsLawB.log')
        fakeRegistry = {
            getLogContent: (uri: vscode.Uri, formatting?: { timestamps?: boolean }) => {
                return logContent
            },
        } as any as LogStreamRegistry
    })

    afterEach(async function () {
        await fs.remove(tempDir)
    })

    it('saves log content to a file', async function () {
        const logGroupInfo = {
            groupName: 'g',
            regionName: 'r',
        }
        const parameters = { streamName: 's' }
        const uri = createURIFromArgs(logGroupInfo, parameters)

        await saveCurrentLogStreamContent(
            uri,
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

    it('does not do anything if the URI is invalid', async function () {
        await saveCurrentLogStreamContent(
            vscode.Uri.parse(`notCloudWatch:hahahaha`),
            fakeRegistry,
            new FakeWindow({
                dialog: {
                    saveSelection: vscode.Uri.file(filename),
                },
            })
        )
        assert.strictEqual(await fileExists(filename), false)
    })

    // TODO: Add test for fs.writeFile failure. Apparently `fs.chmod` doesn't work on Windows?
})
