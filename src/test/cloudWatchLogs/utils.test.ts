/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { createURIFromArgs, parseCloudWatchLogsUri } from '../../cloudWatchLogs/cloudWatchLogsUtils'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'

const goodComponents = {
    logGroupInfo: {
        groupName: 'theBeeGees',
        streamName: 'islandsInTheStream',
        regionName: 'ap-southeast-2',
    },
    action: 'viewLogStream',
    parameters: {},
}

const goodUri = vscode.Uri.parse(
    `${CLOUDWATCH_LOGS_SCHEME}:${goodComponents.action}:${goodComponents.logGroupInfo.groupName}:${goodComponents.logGroupInfo.regionName}:${goodComponents.logGroupInfo.streamName}`
)

describe('convertUriToLogGroupInfo', async function () {
    it('converts a valid URI to components', function () {
        const result = parseCloudWatchLogsUri(goodUri)
        assert.deepStrictEqual(result.logGroupInfo, goodComponents.logGroupInfo)
        assert.deepStrictEqual(result.parameters, goodComponents.parameters)
    })

    it('does not convert URIs with an invalid scheme', async function () {
        assert.throws(() => {
            parseCloudWatchLogsUri(vscode.Uri.parse('wrong:scheme'))
        })
    })

    it('does not convert URIs with more or less than three elements', async function () {
        assert.throws(() => {
            parseCloudWatchLogsUri(vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:elementOne:elementTwo`))
        })

        assert.throws(() => {
            parseCloudWatchLogsUri(
                vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:elementOne:elementTwo:elementThree:whoopsAllElements`)
            )
        })
    })
})

describe('convertLogGroupInfoToUri', function () {
    it('converts components to a valid URI', function () {
        assert.deepStrictEqual(
            createURIFromArgs(goodComponents.action, goodComponents.logGroupInfo, goodComponents.parameters),
            goodUri
        )
    })
})
