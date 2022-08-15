/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import { createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { saveCurrentLogDataContent } from '../../../cloudWatchLogs/commands/saveCurrentLogDataContent'
import { LogStreamRegistry } from '../../../cloudWatchLogs/registry/logDataRegistry'
import { fileExists, makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe('saveCurrentLogDataContent', async function () {
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
            streamName: 's',
        }
        const uri = createURIFromArgs(logGroupInfo, {})

        await saveCurrentLogDataContent(
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
        await saveCurrentLogDataContent(
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
