/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import { createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { saveCurrentLogDataContent } from '../../../cloudWatchLogs/commands/saveCurrentLogDataContent'
import { fileExists, makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { getTestWindow } from '../../shared/vscode/window'
import {
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    CloudWatchLogsResponse,
    LogDataRegistry,
} from '../../../cloudWatchLogs/registry/logDataRegistry'
import { assertTextEditorContains } from '../../testUtil'

async function testFilterLogEvents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    apiParameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    return {
        events: [
            { message: 'The first log event', logStreamName: 'stream1', timestamp: 1675451113 },
            { message: 'The second log event', logStreamName: 'stream2', timestamp: 1675451114 },
        ],
    }
}

describe('saveCurrentLogDataContent', async function () {
    let filename: string
    let tempDir: string
    const expectedText = `1970-01-20T09:24:11.113+00:00\tThe first log event
1970-01-20T09:24:11.114+00:00\tThe second log event
`

    beforeEach(async function () {
        tempDir = await makeTemporaryToolkitFolder()
        filename = path.join(tempDir, 'bobLoblawsLawB.log')
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
        LogDataRegistry.instance.registerInitialLog(uri, testFilterLogEvents)
        await LogDataRegistry.instance.fetchNextLogEvents(uri, true)
        vscode.window.showTextDocument(uri)
        await assertTextEditorContains(expectedText, false) // Wait for document provider.

        getTestWindow().onDidShowDialog(d => d.selectItem(vscode.Uri.file(filename)))
        await saveCurrentLogDataContent()

        assert.ok(await fileExists(filename))
        assert.strictEqual(await readFileAsString(filename), expectedText)
    })

    it('does not do anything if the URI is invalid', async function () {
        getTestWindow().onDidShowDialog(d => d.selectItem(vscode.Uri.file(filename)))
        vscode.window.showTextDocument(vscode.Uri.parse(`notCloudWatch:hahahaha`))
        await saveCurrentLogDataContent()
        assert.strictEqual(await fileExists(filename), false)
    })
})
