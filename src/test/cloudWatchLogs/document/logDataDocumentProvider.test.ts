/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { CloudWatchLogsSettings, createURIFromArgs, isLogStreamUri } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { LogDataDocumentProvider } from '../../../cloudWatchLogs/document/logDataDocumentProvider'
import {
    LogDataRegistry,
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    CloudWatchLogsResponse,
} from '../../../cloudWatchLogs/registry/logDataRegistry'
import { Settings } from '../../../shared/settings'
import { LogDataCodeLensProvider } from '../../../cloudWatchLogs/document/logDataCodeLensProvider'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'
import { FilteredLogEvent } from 'aws-sdk/clients/cloudwatchlogs'

const getLogEventsMessage = 'This is from getLogEvents'

export async function testGetLogEvents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    apiParameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    return {
        events: [
            {
                message: getLogEventsMessage,
            },
        ],
    }
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

describe('LogDataDocumentProvider', async function () {
    let provider: LogDataDocumentProvider
    let registry: LogDataRegistry
    let codeLensProvider: LogDataCodeLensProvider
    let config: Settings

    const getLogsLogGroupInfo: CloudWatchLogsGroupInfo = {
        groupName: 'group',
        regionName: 'region',
        streamName: 'stream',
    }
    const getLogsUri = createURIFromArgs(getLogsLogGroupInfo, {})

    const filterLogsStream: CloudWatchLogsData = {
        events: [],
        parameters: { filterPattern: 'lookForThis' },
        logGroupInfo: {
            groupName: 'group',
            regionName: 'region',
        },
        retrieveLogsFunction: testFilterLogEvents,
        busy: false,
    }

    const filterLogsUri = createURIFromArgs(filterLogsStream.logGroupInfo, filterLogsStream.parameters)

    before(function () {
        config = new Settings(vscode.ConfigurationTarget.Workspace)

        registry = new LogDataRegistry(new CloudWatchLogsSettings(config))
        registry.registerInitialLog(getLogsUri, testGetLogEvents)
        registry.registerInitialLog(filterLogsUri, testFilterLogEvents)

        provider = new LogDataDocumentProvider(registry)

        codeLensProvider = new LogDataCodeLensProvider(registry)
    })

    it('provides content if it exists', async function () {
        await registry.fetchNextLogEvents(getLogsUri, false)

        const result = provider.provideTextDocumentContent(getLogsUri)
        const expected = `                             \t${getLogEventsMessage}\n`
        assert.strictEqual(result, expected)
    })

    it('throws error on attempt to get content from non-cwl uri', async function () {
        await registry.fetchNextLogEvents(getLogsUri, true)

        const emptyUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:has:Not`)
        assert.throws(() => provider.provideTextDocumentContent(emptyUri), {
            message: `Uri is not a CWL Uri, so no text can be provided: ${emptyUri.toString()}`,
        })
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

    describe('getLogStreamNameAtLine', () => {
        const logGroupInfo: CloudWatchLogsGroupInfo = {
            groupName: 'groupA',
            regionName: 'regionA',
            streamName: 'streamA',
        }
        const logStreamNameUri = createURIFromArgs(logGroupInfo, {})

        const events: FilteredLogEvent[] = [
            {
                message: 'This is the first message',
                logStreamName: 'logStream0',
            },
            {
                message: 'This is the second message',
                logStreamName: 'logStream0',
            },
            {
                message: 'This is the third message',
                logStreamName: 'logStream1',
            },
            {
                message: 'This is the fourth message',
                logStreamName: 'logStream2',
            },
        ]

        async function getLogEventsFromMultipleStreams(
            logGroupInfo: CloudWatchLogsGroupInfo,
            apiParameters: CloudWatchLogsParameters,
            nextToken?: string
        ): Promise<CloudWatchLogsResponse> {
            return {
                events,
            }
        }

        before(async () => {
            registry.registerInitialLog(logStreamNameUri, getLogEventsFromMultipleStreams)
            await registry.fetchNextLogEvents(logStreamNameUri, true)
            provider.provideTextDocumentContent(logStreamNameUri)
        })

        it('gives the correct stream id for each line', () => {
            for (let i = 0; i < events.length; i++) {
                assert.strictEqual(provider.getLogStreamNameAtLine(logStreamNameUri, i), events[i].logStreamName)
            }
        })
    })
})
