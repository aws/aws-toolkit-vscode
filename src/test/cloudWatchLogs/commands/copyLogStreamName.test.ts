/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { copyLogStreamName } from '../../../cloudWatchLogs/commands/copyLogStreamName'

describe('copyLogStreamName', async function () {
    beforeEach(async function () {
        await vscode.env.clipboard.writeText('')
    })

    afterEach(async function () {
        await vscode.env.clipboard.writeText('')
    })

    it('copies stream names from valid URIs and does not copy anything new if the URI is invalid', async function () {
        const logGroupInfo = {
            groupName: 'group',
            regionName: 'region',
            streamName: 'stream',
        }
        const uri = createURIFromArgs(logGroupInfo, {})

        await copyLogStreamName(uri)

        assert.strictEqual(await vscode.env.clipboard.readText(), logGroupInfo.streamName)
        await copyLogStreamName(vscode.Uri.parse(`notCloudWatch:hahahaha`))

        assert.strictEqual(await vscode.env.clipboard.readText(), logGroupInfo.streamName)
    })
})
