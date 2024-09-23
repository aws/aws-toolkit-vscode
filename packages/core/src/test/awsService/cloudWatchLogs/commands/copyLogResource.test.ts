/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { copyLogResource } from '../../../../awsService/cloudWatchLogs/commands/copyLogResource'
import { cwlUriSchema } from '../../../../awsService/cloudWatchLogs/cloudWatchLogsUtils'

describe('copyLogResource', async function () {
    beforeEach(async function () {
        await vscode.env.clipboard.writeText('')
    })

    afterEach(async function () {
        await vscode.env.clipboard.writeText('')
    })

    it('copies stream names from valid URIs with stream open', async function () {
        const logGroupWithStream = {
            groupName: 'group',
            regionName: 'region',
            streamName: 'stream',
        }
        const uri = cwlUriSchema.form({ logGroupInfo: logGroupWithStream, parameters: {} })

        await copyLogResource(uri)

        assert.strictEqual(await vscode.env.clipboard.readText(), logGroupWithStream.streamName)
    })

    it('copies group names from valid URIs with group open', async function () {
        const logGroup = {
            groupName: 'group2',
            regionName: 'region2',
        }
        const uri = cwlUriSchema.form({ logGroupInfo: logGroup, parameters: {} })

        await copyLogResource(uri)

        assert.strictEqual(await vscode.env.clipboard.readText(), logGroup.groupName)
    })

    it('does not copy anything new if the URI is invalid', async function () {
        await vscode.env.clipboard.writeText('default text')
        await copyLogResource(vscode.Uri.parse(`notCloudWatch:hahahaha`))

        assert.strictEqual(await vscode.env.clipboard.readText(), 'default text')
    })
})
