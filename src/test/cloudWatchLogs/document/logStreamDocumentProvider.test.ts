/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import {
    CloudWatchLogsSettings,
    createURIFromArgs,
    canShowPreviousLogs,
    uriToKey,
} from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { LogStreamDocumentProvider } from '../../../cloudWatchLogs/document/logStreamDocumentProvider'
import {
    LogStreamRegistry,
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    CloudWatchLogsResponse,
} from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { Settings } from '../../../shared/settings'
import { LogStreamCodeLensProvider } from '../../../cloudWatchLogs/document/logStreamCodeLensProvider'

function testGetLogEvents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    apiParameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    return Promise.resolve({
        events: [
            {
                message: 'This is from getLogEvents',
            },
        ],
    })
}

async function testFilterLogEvents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    apiParameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    return Promise.resolve({
        events: [
            {
                message: 'This is from filterLogEvents',
            },
        ],
    })
}

describe('LogStreamDocumentProvider', function () {
    const map = new Map<string, CloudWatchLogsData>()
    let provider: LogStreamDocumentProvider
    const config = new Settings(vscode.ConfigurationTarget.Workspace)
    const registry = new LogStreamRegistry(new CloudWatchLogsSettings(config), map)

    const codeLensProvider = new LogStreamCodeLensProvider(registry)

    // TODO: Make this less flaky when we add manual timestamp controls.
    const message = "i'm just putting something here because it's a friday"
    const getLogsStream: CloudWatchLogsData = {
        data: [
            {
                message,
            },
        ],
        parameters: { streamName: 'stream' },
        logGroupInfo: {
            groupName: 'group',
            regionName: 'region',
        },
        retrieveLogsFunction: testGetLogEvents,
        busy: false,
    }
    const getLogsUri = createURIFromArgs(getLogsStream.logGroupInfo, getLogsStream.parameters)

    const filterLogsStream: CloudWatchLogsData = {
        data: [],
        parameters: { filterPattern: 'lookForThis' },
        logGroupInfo: {
            groupName: 'group',
            regionName: 'region',
        },
        retrieveLogsFunction: testFilterLogEvents,
        busy: false,
    }

    const filterLogsUri = createURIFromArgs(filterLogsStream.logGroupInfo, filterLogsStream.parameters)

    before(async function () {
        provider = new LogStreamDocumentProvider(registry)
        map.set(uriToKey(getLogsUri), getLogsStream)
        map.set(uriToKey(filterLogsUri), filterLogsStream)
    })

    it('provides content if it exists and a blank string if it does not', function () {
        assert.strictEqual(
            provider.provideTextDocumentContent(getLogsUri),
            `                             \t${message}\n`
        )
        assert.strictEqual(provider.provideTextDocumentContent(vscode.Uri.parse('has:Not')), '')
    })

    it("Give backward codelense if viewing log stream and doesn't if not", async function () {
        const fakeGetLogsDocument = await vscode.workspace.openTextDocument(getLogsUri)
        const fakeFilterLogsDocument = await vscode.workspace.openTextDocument(filterLogsUri)
        const fakeVscodeToken = {} as vscode.CancellationToken

        const fakeGetLogsCodeLens = codeLensProvider.provideCodeLenses(fakeGetLogsDocument, fakeVscodeToken)
        const fakeFilterLogsCodeLens = codeLensProvider.provideCodeLenses(fakeFilterLogsDocument, fakeVscodeToken)

        assert(fakeGetLogsCodeLens)
        assert(fakeFilterLogsCodeLens)

        assert.strictEqual(canShowPreviousLogs(filterLogsUri), false)
        assert.strictEqual(canShowPreviousLogs(getLogsUri), true)
        assert.notStrictEqual(fakeGetLogsCodeLens, fakeFilterLogsCodeLens)
    })
})
