/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import { createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { saveCurrentLogDataContent } from '../../../cloudWatchLogs/commands/saveCurrentLogDataContent'
import { CloudWatchLogsEvent, LogDataRegistry } from '../../../cloudWatchLogs/registry/logDataRegistry'
import { fileExists, makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { getTestWindow } from '../../shared/vscode/window'

describe('saveCurrentLogDataContent', async function () {
    let filename: string
    let fakeRegistry: LogDataRegistry
    let tempDir: string
    const expectedText = `1970-01-20T09:24:11.113+00:00\tThe first log event
1970-01-20T09:24:11.114+00:00\tThe second log event
`

    beforeEach(async function () {
        tempDir = await makeTemporaryToolkitFolder()
        filename = path.join(tempDir, 'bobLoblawsLawB.log')
        fakeRegistry = {
            fetchCachedLogEvents: (uri: vscode.Uri) => {
                const events: CloudWatchLogsEvent[] = [
                    { message: 'The first log event', logStreamName: 'stream1', timestamp: 1675451113 },
                    { message: 'The second log event', logStreamName: 'stream2', timestamp: 1675451114 },
                ]
                return events
            },
        } as any as LogDataRegistry
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

        getTestWindow().onDidShowDialog(d => d.selectItem(vscode.Uri.file(filename)))
        await saveCurrentLogDataContent(uri, fakeRegistry)

        assert.ok(await fileExists(filename))
        assert.strictEqual(await readFileAsString(filename), expectedText)
    })

    it('does not do anything if the URI is invalid', async function () {
        getTestWindow().onDidShowDialog(d => d.selectItem(vscode.Uri.file(filename)))
        await saveCurrentLogDataContent(vscode.Uri.parse(`notCloudWatch:hahahaha`), fakeRegistry)
        assert.strictEqual(await fileExists(filename), false)
    })

    // TODO: Add test for fs.writeFile failure. Apparently `fs.chmod` doesn't work on Windows?
})
