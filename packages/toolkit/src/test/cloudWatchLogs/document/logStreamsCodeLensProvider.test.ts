/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe } from 'mocha'
import { LogStreamCodeLensProvider } from '../../../cloudWatchLogs/document/logStreamsCodeLensProvider'
import { LogDataRegistry } from '../../../cloudWatchLogs/registry/logDataRegistry'
import { LogDataDocumentProvider } from '../../../cloudWatchLogs/document/logDataDocumentProvider'
import { CancellationToken, CodeLens, TextDocument } from 'vscode'
import assert = require('assert')
import { createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { createStubInstance, SinonStubbedInstance } from 'sinon'

describe('LogStreamCodeLensProvider', async () => {
    describe('provideCodeLenses()', async () => {
        let codeLensProvider: LogStreamCodeLensProvider
        let documentProvider: SinonStubbedInstance<LogDataDocumentProvider>

        const logGroupInfo = { groupName: 'MyGroupName', regionName: 'MyRegionName' }
        const logUri = createURIFromArgs(logGroupInfo, {})

        before(async () => {
            const registry: LogDataRegistry = {} as LogDataRegistry
            documentProvider = createStubInstance(LogDataDocumentProvider)

            codeLensProvider = new LogStreamCodeLensProvider(registry, documentProvider as any)
        })
        it('gets codelenses from a typical file', async () => {
            const logStreamIdAtLine = ['streamId0', 'streamId0', 'streamId0', 'streamId1', 'streamId1', 'streamId2']
            // Stub method which provides the log stream ID at a given line
            for (let i = 0; i < logStreamIdAtLine.length; i++) {
                documentProvider.getLogStreamNameAtLine.onCall(i).returns(logStreamIdAtLine[i])
            }

            const result = await codeLensProvider.provideCodeLenses(
                { uri: logUri, lineCount: logStreamIdAtLine.length + 1 } as TextDocument,
                {} as CancellationToken
            )

            // Create code lenses at the first occurence of each Log Stream
            const expected = [
                createCodeLensAtFirstOccurence('streamId0', logStreamIdAtLine),
                createCodeLensAtFirstOccurence('streamId1', logStreamIdAtLine),
                createCodeLensAtFirstOccurence('streamId2', logStreamIdAtLine),
            ]
            assert.deepStrictEqual(result, expected)
        })

        /**
         * Creates a code lens at the first occurence of a stream id in the
         * given string array.
         */
        function createCodeLensAtFirstOccurence(streamId: string, logStreamIdAtLine: string[]): CodeLens {
            const firstOccurenceIndex = logStreamIdAtLine.findIndex(value => value === streamId)
            return codeLensProvider.createLogStreamCodeLens(logGroupInfo, {
                streamId: logStreamIdAtLine[firstOccurenceIndex],
                lineNum: firstOccurenceIndex,
            })
        }
    })
})
