/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { convertLogGroupInfoToUri, parseCloudWatchLogsUri } from '../../cloudWatchLogs/cloudWatchLogsUtils'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'
import { assertThrowsError } from '../shared/utilities/assertUtils'

const goodComponents = {
    groupName: 'theBeeGees',
    streamName: 'islandsInTheStream',
    regionName: 'ap-southeast-2',
}
const goodUri = vscode.Uri.parse(
    `${CLOUDWATCH_LOGS_SCHEME}:${goodComponents.groupName}:${goodComponents.streamName}:${goodComponents.regionName}`
)

describe('convertUriToLogGroupInfo', async function () {
    it('converts a valid URI to components', function () {
        assert.deepStrictEqual(parseCloudWatchLogsUri(goodUri), goodComponents)
    })

    it('does not convert URIs with an invalid scheme', async function () {
        await assertThrowsError(async () => {
            parseCloudWatchLogsUri(vscode.Uri.parse('wrong:scheme'))
        })
    })

    it('does not convert URIs with more or less than three elements', async function () {
        await assertThrowsError(async () => {
            parseCloudWatchLogsUri(vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:elementOne:elementTwo`))
        })

        await assertThrowsError(async () => {
            parseCloudWatchLogsUri(
                vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:elementOne:elementTwo:elementThree:whoopsAllElements`)
            )
        })
    })
})

describe('convertLogGroupInfoToUri', function () {
    it('converts components to a valid URI', function () {
        assert.deepStrictEqual(
            convertLogGroupInfoToUri(goodComponents.groupName, goodComponents.streamName, goodComponents.regionName),
            goodUri
        )
    })
})
