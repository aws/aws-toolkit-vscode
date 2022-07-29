/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import {
    createURIFromArgs,
    parseCloudWatchLogsUri,
    uriToKey,
    findOccurencesOf,
} from '../../cloudWatchLogs/cloudWatchLogsUtils'
import {
    CloudWatchLogsParameters,
    CloudWatchLogsData,
    CloudWatchLogsResponse,
} from '../../cloudWatchLogs/registry/logStreamRegistry'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'

const newText = 'a little longer now\n'

export async function fakeGetLogEvents(): Promise<CloudWatchLogsResponse> {
    return {
        events: [
            {
                message: newText,
            },
        ],
    }
}

export async function fakeSearchLogGroup(): Promise<CloudWatchLogsResponse> {
    return {
        events: [
            {
                message: newText,
                logStreamName: 'testStreamName',
            },
        ],
    }
}

export const testComponents = {
    logGroupInfo: {
        groupName: 'this-is-a-group',
        regionName: 'this-is-a-region',
    },
    parameters: { streamName: 'this-is-a-stream', filterPattern: 'this is a bad filter!' },
}

export const testStreamData1: CloudWatchLogsData = {
    data: [
        {
            timestamp: 1,
            message: 'is the loneliest number\n',
        },
        {
            timestamp: 2,
            message: 'can be as sad as one\n',
        },
        {
            timestamp: 3,
            message: '...dog night covered this song\n',
        },
        {
            message: 'does anybody really know what time it is? does anybody really care?\n',
        },
    ],
    parameters: { streamName: 'Registered' },
    logGroupInfo: {
        groupName: 'This',
        regionName: 'Is',
    },
    retrieveLogsFunction: fakeGetLogEvents,
    busy: false,
}
const goodUri = createURIFromArgs(testComponents.logGroupInfo, testComponents.parameters)

describe('parseCloudWatchLogsUri', async function () {
    it('converts a valid URI to components', function () {
        const result = parseCloudWatchLogsUri(goodUri)
        assert.deepStrictEqual(result.logGroupInfo, testComponents.logGroupInfo)
        assert.deepStrictEqual(result.parameters, testComponents.parameters)
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

describe('createURIFromArgs', function () {
    it('converts components to a valid URI that can be parsed.', function () {
        const testUri = vscode.Uri.parse(
            `${CLOUDWATCH_LOGS_SCHEME}:${testComponents.logGroupInfo.groupName}:${
                testComponents.logGroupInfo.regionName
            }?${encodeURIComponent(JSON.stringify(testComponents.parameters))}`
        )
        assert.deepStrictEqual(testUri, goodUri)
        const newTestComponents = parseCloudWatchLogsUri(testUri)
        assert.deepStrictEqual(testComponents, newTestComponents)
    })
})

describe('uriToKey', function () {
    let testUri: vscode.Uri
    before(function () {
        testUri = vscode.Uri.parse(
            `${CLOUDWATCH_LOGS_SCHEME}:g:r
            ?${encodeURIComponent(JSON.stringify(testComponents.parameters))}`
        )
    })

    it('throws error if query not parsable', function () {
        const badUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:g:r?ThisIsNotAJson`)
        assert.throws(() => uriToKey(badUri))
    })

    it('creates the same key for different order query', function () {
        const param1: CloudWatchLogsParameters = { filterPattern: 'same', startTime: 0 }
        const param2: CloudWatchLogsParameters = { startTime: 0, filterPattern: 'same' }
        const firstOrder = createURIFromArgs(testComponents.logGroupInfo, param1)
        const secondOrder = createURIFromArgs(testComponents.logGroupInfo, param2)

        assert.notDeepStrictEqual(firstOrder, secondOrder)
        assert.strictEqual(uriToKey(firstOrder), uriToKey(secondOrder))
    })

    it('creates unique strings for Uri with different parameters', function () {
        const diffParameters = { streamName: 'NotIslandsInTheStream' }

        const uriDiffParameters = vscode.Uri.parse(
            `${CLOUDWATCH_LOGS_SCHEME}:g:r
            ?${encodeURIComponent(JSON.stringify(diffParameters))}`
        )

        assert.notStrictEqual(uriToKey(testUri), uriToKey(uriDiffParameters))
    })

    it('creates unique strings for Uri with different log group info', function () {
        const uriDiffGroup = vscode.Uri.parse(
            `${CLOUDWATCH_LOGS_SCHEME}:g2:r2
            ?${encodeURIComponent(JSON.stringify(testComponents.parameters))}`
        )

        assert.notStrictEqual(uriToKey(testUri), uriToKey(uriDiffGroup))
    })
})

describe('findOccurrencesOf', function () {
    it('finds correct number', async function () {
        const testDoc1 = await vscode.workspace.openTextDocument({ content: 'Arr' })
        const result1 = findOccurencesOf(testDoc1, 'rr')
        const expected1 = [new vscode.Range(new vscode.Position(0, 1), new vscode.Position(0, 3))]

        const testDoc2 = await vscode.workspace.openTextDocument({
            content:
                'Here is a bunch of text (here) \n and it even spans multiple lines (here) \n to make it more interesting (here) \n (here) because why not \n',
        })
        const result2 = findOccurencesOf(testDoc2, 'here')
        const expected2 = [
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 4)),
            new vscode.Range(new vscode.Position(0, 25), new vscode.Position(0, 29)),
            new vscode.Range(new vscode.Position(1, 35), new vscode.Position(1, 39)),
            new vscode.Range(new vscode.Position(2, 30), new vscode.Position(2, 34)),
            new vscode.Range(new vscode.Position(3, 2), new vscode.Position(3, 6)),
        ]

        const testDoc3 = await vscode.workspace.openTextDocument({ content: 'Here is a \n weird \n one\n zzz' })
        const result3 = findOccurencesOf(testDoc3, 'zz')
        const expected3 = [
            new vscode.Range(new vscode.Position(3, 1), new vscode.Position(3, 3)),
            new vscode.Range(new vscode.Position(3, 2), new vscode.Position(3, 4)),
        ]

        assert.deepStrictEqual(result1, expected1)
        assert.deepStrictEqual(result2, expected2)
        assert.deepStrictEqual(result3, expected3)
    })
})
