/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { CloudWatchLogsSettings, createURIFromArgs, isLogStreamUri } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { LogDataDocumentProvider } from '../../../cloudWatchLogs/document/logDataDocumentProvider'
import {
    LogDataRegistry,
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    CloudWatchLogsResponse,
    ActiveTab,
} from '../../../cloudWatchLogs/registry/logDataRegistry'
import { Settings } from '../../../shared/settings'
import { LogDataCodeLensProvider } from '../../../cloudWatchLogs/document/logDataCodeLensProvider'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'

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
    const map = new Map<string, ActiveTab>()
    let provider: LogDataDocumentProvider
    const config = new Settings(vscode.ConfigurationTarget.Workspace)
    const registry = new LogDataRegistry(new CloudWatchLogsSettings(config), map)

    const codeLensProvider = new LogDataCodeLensProvider(registry)

    // TODO: Make this less flaky when we add manual timestamp controls.
    const message = "i'm just putting something here because it's a friday"
    const getLogsStream: CloudWatchLogsData = {
        data: [
            {
                message,
            },
        ],
        parameters: {},
        logGroupInfo: {
            groupName: 'group',
            regionName: 'region',
            streamName: 'stream',
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
        registry.setLogData(getLogsUri, getLogsStream)
        registry.setLogData(filterLogsUri, filterLogsStream)
        provider = new LogDataDocumentProvider(registry)
    })

    it('provides content if it exists and a blank string if it does not', function () {
        assert.strictEqual(
            provider.provideTextDocumentContent(getLogsUri),
            `                             \t${message}\n`
        )
        const emptyUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:has:Not`)
        assert.strictEqual(provider.provideTextDocumentContent(emptyUri), '')
    })

    it("Give backward codelense if viewing log stream and doesn't if not", async function () {
        const fakeGetLogsDocument = await vscode.workspace.openTextDocument(getLogsUri)
        const fakeFilterLogsDocument = await vscode.workspace.openTextDocument(filterLogsUri)
        const fakeVscodeToken = {} as vscode.CancellationToken

        const fakeGetLogsCodeLens = codeLensProvider.provideCodeLenses(fakeGetLogsDocument, fakeVscodeToken)
        const fakeFilterLogsCodeLens = codeLensProvider.provideCodeLenses(fakeFilterLogsDocument, fakeVscodeToken)

        assert(fakeGetLogsCodeLens)
        assert(fakeFilterLogsCodeLens)

        assert.strictEqual(isLogStreamUri(filterLogsUri), false)
        assert.strictEqual(isLogStreamUri(getLogsUri), true)
        assert.notStrictEqual(fakeGetLogsCodeLens, fakeFilterLogsCodeLens)
    })
})
