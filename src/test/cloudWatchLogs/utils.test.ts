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
import { CloudWatchLogsParameters } from '../../cloudWatchLogs/registry/logStreamRegistry'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'

const goodComponents = {
    logGroupInfo: {
        groupName: 'theBeeGees',
        regionName: 'ap-southeast-2',
    },
    parameters: { streamName: 'islandsInTheStream' },
}

const goodUri = createURIFromArgs(goodComponents.logGroupInfo, goodComponents.parameters)

describe('parseCloudWatchLogsUri', async function () {
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

describe('createURIFromArgs', function () {
    it('converts components to a valid URI that can be parsed.', function () {
        const testUri = vscode.Uri.parse(
            `${CLOUDWATCH_LOGS_SCHEME}:${goodComponents.logGroupInfo.groupName}:${
                goodComponents.logGroupInfo.regionName
            }?${encodeURIComponent(JSON.stringify(goodComponents.parameters))}`
        )
        assert.deepStrictEqual(testUri, goodUri)
        const testComponents = parseCloudWatchLogsUri(testUri)
        assert.deepStrictEqual(testComponents, goodComponents)
    })
})

describe('uriToKey', function () {
    let testUri: vscode.Uri
    before(function () {
        testUri = vscode.Uri.parse(
            `${CLOUDWATCH_LOGS_SCHEME}:g:r
            ?${encodeURIComponent(JSON.stringify(goodComponents.parameters))}`
        )
    })

    it('throws error if query not parsable', function () {
        const badUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:g:r?ThisIsNotAJson`)
        assert.throws(() => uriToKey(badUri))
    })

    it('creates the same key for different order query', function () {
        const param1: CloudWatchLogsParameters = { filterPattern: 'same', startTime: 0 }
        const param2: CloudWatchLogsParameters = { startTime: 0, filterPattern: 'same' }
        const firstOrder = createURIFromArgs(goodComponents.logGroupInfo, param1)
        const secondOrder = createURIFromArgs(goodComponents.logGroupInfo, param2)

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
            ?${encodeURIComponent(JSON.stringify(goodComponents.parameters))}`
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
