/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { copyLogStreamName } from '../../../cloudWatchLogs/commands/copyLogStreamName'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'
import { assertThrowsError } from '../../shared/utilities/assertUtils'

describe('copyLogStreamName', async () => {
    beforeEach(async () => {
        await vscode.env.clipboard.writeText('')
    })

    afterEach(async () => {
        await vscode.env.clipboard.writeText('')
    })

    it('copies stream names from valid URIs', async () => {
        const streamName = 'stream'
        await copyLogStreamName(vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:group:${streamName}:account`))

        assert.strictEqual(await vscode.env.clipboard.readText(), streamName)
    })

    it('throws if the URI is invalid', () => {
        assertThrowsError(async () => copyLogStreamName(vscode.Uri.parse(`notCloudWatch:hahahaha`)))
    })
})
