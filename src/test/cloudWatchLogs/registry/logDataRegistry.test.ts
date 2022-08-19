/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as moment from 'moment'
import * as vscode from 'vscode'
import { LogDataRegistry, ActiveTab } from '../../../cloudWatchLogs/registry/logDataRegistry'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../../../shared/constants'
import { Settings } from '../../../shared/settings'
import { CloudWatchLogsSettings, createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import {
    addedEvent,
    backwardToken,
    fakeGetLogEvents,
    fakeSearchLogGroup,
    forwardToken,
    logGroupsData,
    newLineData,
    newText,
    paginatedData,
    returnNonEmptyPaginatedEvents,
    testLogData,
    testStreamNames,
    unregisteredData,
} from '../utils.test'

describe('LogDataRegistry', async function () {
    let registry: LogDataRegistry
    let map: Map<string, ActiveTab>

    const config = new Settings(vscode.ConfigurationTarget.Workspace)

    const registeredUri = createURIFromArgs(testLogData.logGroupInfo, testLogData.parameters)
    const unregisteredUri = createURIFromArgs(unregisteredData.logGroupInfo, unregisteredData.parameters)
    const newLineUri = createURIFromArgs(newLineData.logGroupInfo, newLineData.parameters)
    const searchLogGroupUri = createURIFromArgs(logGroupsData.logGroupInfo, logGroupsData.parameters)
    const paginatedUri = createURIFromArgs(paginatedData.logGroupInfo, paginatedData.parameters)

    async function testUpdateLog(headOrTail: 'head' | 'tail') {
        const oldData = registry.getLogData(paginatedUri)
        // check that oldData is unchanged.
        assert(oldData)
        assert.deepStrictEqual(oldData.data, paginatedData.data)

        await registry.updateLog(paginatedUri, headOrTail)

        // check that newData is changed to what it should be.
        const newData = registry.getLogData(paginatedUri)
        assert(newData)
        const expected = headOrTail === 'head' ? (await fakeSearchLogGroup()).events : (await fakeGetLogEvents()).events
        assert.deepStrictEqual(newData.data, expected)
    }

    beforeEach(function () {
        registry = new LogDataRegistry(new CloudWatchLogsSettings(config), map)
        registry.setLogData(registeredUri, testLogData)
        registry.setLogData(newLineUri, newLineData)
        registry.setLogData(searchLogGroupUri, logGroupsData)
        registry.setLogData(paginatedUri, paginatedData)
    })

    describe('hasLog', function () {
        it('correctly returns whether or not the log is registered', function () {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            assert.strictEqual(registry.hasLog(unregisteredUri), false)
        })
    })

    describe('registerLog', async function () {
        it("registers logs and doesn't overwrite existing logs", async () => {
            await registry.registerLog(unregisteredUri, unregisteredData)
            const blankPostRegister = registry.getLogData(unregisteredUri)
            assert(blankPostRegister)
            assert.strictEqual(blankPostRegister.data[0].message, newText)

            const preregisteredLogData = registry.getLogData(registeredUri)
            assert(preregisteredLogData)
            assert.strictEqual(preregisteredLogData.data[0].message, testLogData.data[0].message)
        })
    })

    describe('updateLog', async function () {
        it("properply paginates the results with 'head'", async () => {
            await testUpdateLog('head')
        })

        it("properply paginates the results with 'tail'", async () => {
            await testUpdateLog('tail')
        })

        it('handles case of updating multiple times with new tokens', async () => {
            const oldData = registry.getLogData(paginatedUri)
            // check that oldData is unchanged.
            assert(oldData)
            assert.deepStrictEqual(oldData.data, paginatedData.data)

            // Swap to use other paginate testing function
            paginatedData.retrieveLogsFunction = returnNonEmptyPaginatedEvents

            // Make first call.
            await registry.updateLog(paginatedUri)
            const firstUpdatedData = registry.getLogData(paginatedUri)
            assert(firstUpdatedData)

            const firstExpected = {
                events: [addedEvent],
                nextForwardToken: forwardToken,
                nextBackwardToken: backwardToken,
            }

            const firstActual = {
                events: firstUpdatedData.data,
                nextForwardToken: firstUpdatedData.next?.token,
                nextBackwardToken: firstUpdatedData.previous?.token,
            }

            assert.deepStrictEqual(firstActual, firstExpected)

            // Make second call.
            await registry.updateLog(paginatedUri)
            const secondUpdatedData = registry.getLogData(paginatedUri)
            assert(secondUpdatedData)

            const secondExpected = {
                events: firstUpdatedData.data.concat((await fakeGetLogEvents()).events),
                nextForwardToken: '',
                nextBackwardToken: '',
            }
            const secondActual = {
                events: secondUpdatedData.data,
                nextForwardToken: secondUpdatedData.next?.token,
                nextBackwardToken: secondUpdatedData.previous?.token,
            }

            assert.deepStrictEqual(secondActual, secondExpected)
        })
    })

    describe('getLogContent', function () {
        it('gets unformatted log content', function () {
            const text = registry.getLogContent(registeredUri)

            assert.strictEqual(
                text,
                `${testLogData.data[0].message}${testLogData.data[1].message}${testLogData.data[2].message}${testLogData.data[3].message}`
            )
        })

        it('gets log content formatted to show timestamps', function () {
            const text = registry.getLogContent(registeredUri, { timestamps: true })

            assert.strictEqual(
                text,
                `${moment(1).format(INSIGHTS_TIMESTAMP_FORMAT)}${'\t'}${testLogData.data[0].message}${moment(2).format(
                    INSIGHTS_TIMESTAMP_FORMAT
                )}${'\t'}${testLogData.data[1].message}${moment(3).format(INSIGHTS_TIMESTAMP_FORMAT)}${'\t'}${
                    testLogData.data[2].message
                }                             ${'\t'}${testLogData.data[3].message}`
            )
        })

        it('indents log entries with newlines of all flavors if timestamps are shown but otherwise does not act on them', function () {
            const timestampText = registry.getLogContent(newLineUri, { timestamps: true })
            const noTimestampText = registry.getLogContent(newLineUri)

            assert.strictEqual(noTimestampText, newLineData.data[0].message)
            assert.strictEqual(
                timestampText,
                `${moment(newLineData.data[0].timestamp).format(
                    INSIGHTS_TIMESTAMP_FORMAT
                )}${'\t'}the${'\n'}                             ${'\t'}line${'\n'}                             ${'\t'}must${'\n'}                             ${'\t'}be${'\n'}                             ${'\t'}drawn${'\n'}                             ${'\t'}HERE${'\n'}                             ${'\t'}right${'\n'}                             ${'\t'}here${'\n'}                             ${'\t'}no${'\n'}                             ${'\t'}further\n`
            )
        })

        describe('setStreamIds', function () {
            it('registers stream ids to map and clears it on document close', async function () {
                await registry.updateLog(searchLogGroupUri)
                registry.getLogContent(searchLogGroupUri) // We run this to create the mappings
                const doc = await vscode.workspace.openTextDocument(searchLogGroupUri)
                let streamIDMap = registry.getStreamIdMap(searchLogGroupUri)
                const expectedMap = new Map<number, string>([
                    [0, testStreamNames[0]],
                    [1, testStreamNames[1]],
                ])
                assert.deepStrictEqual(streamIDMap, expectedMap)
                registry.disposeRegistryData(doc.uri)
                // We want to re-register log here otherwise this returns undefined.
                registry.setLogData(searchLogGroupUri, logGroupsData)
                streamIDMap = registry.getStreamIdMap(searchLogGroupUri)
                assert.deepStrictEqual(streamIDMap, new Map<number, string>())
            })

            it('handles newlines within event messages', function () {
                const oldData = registry.getLogData(searchLogGroupUri)
                assert(oldData)
                registry.setLogData(searchLogGroupUri, {
                    ...oldData,
                    data: [
                        {
                            message: 'This \n is \n a \n message \n spanning \n many \n lines',
                            logStreamName: 'stream1',
                        },
                        {
                            message: 'Here \n is \n another \n one.',
                            logStreamName: 'stream2',
                        },
                        {
                            message: 'and \n just \n one \n more',
                            logStreamName: 'stream1',
                        },
                        {
                            message: 'and thats it.',
                            logStreamName: 'stream3',
                        },
                    ],
                })
                registry.getLogContent(searchLogGroupUri)
                const streamIDMap = registry.getStreamIdMap(searchLogGroupUri)
                const expectedMap = new Map<number, string>([
                    [0, 'stream1'],
                    [1, 'stream1'],
                    [2, 'stream1'],
                    [3, 'stream1'],
                    [4, 'stream1'],
                    [5, 'stream1'],
                    [6, 'stream1'],
                    [7, 'stream2'],
                    [8, 'stream2'],
                    [9, 'stream2'],
                    [10, 'stream2'],
                    [11, 'stream1'],
                    [12, 'stream1'],
                    [13, 'stream1'],
                    [14, 'stream1'],
                    [15, 'stream3'],
                ])
                assert.deepStrictEqual(streamIDMap, expectedMap)
                registry.setLogData(searchLogGroupUri, oldData)
            })
        })
    })

    describe('updateLog', async function () {
        it("adds content to existing streams at both head and tail ends and doesn't do anything if the log isn't registered", async () => {
            await registry.updateLog(registeredUri, 'tail')
            const initialWithTail = registry.getLogData(registeredUri)
            assert(initialWithTail)
            // concat new message on the end to test tail functionality.
            const testStreamDataTailData = testLogData.data.concat({ message: newText })
            assert.deepStrictEqual(initialWithTail.data, testStreamDataTailData)

            await registry.updateLog(registeredUri, 'head')
            const initialWithHeadAndTail = registry.getLogData(registeredUri)
            assert(initialWithHeadAndTail)
            // concat new message on the beginning to test head functionality.
            const testStreamDataHeadAndTailData =
                (testStreamDataTailData.unshift({ message: newText }), testStreamDataTailData)
            assert.deepStrictEqual(initialWithHeadAndTail.data, testStreamDataHeadAndTailData)

            await registry.updateLog(unregisteredUri, 'tail')
            const unregisteredGet = registry.getLogContent(unregisteredUri)
            assert.strictEqual(unregisteredGet, undefined)
        })
    })

    describe('disposeRegistryData', function () {
        it('deletes a log', function () {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            registry.disposeRegistryData(registeredUri)
            assert.strictEqual(registry.hasLog(registeredUri), false)
        })

        it('does not error if the log does not exist in the registry', function () {
            assert.strictEqual(registry.hasLog(unregisteredUri), false)
            registry.disposeRegistryData(unregisteredUri)
            assert.strictEqual(registry.hasLog(unregisteredUri), false)
        })
    })

    describe('Timestamp', function () {
        it('matches CloudWatch insights timestamps', function () {
            const time = 1624201162222 // 2021-06-20 14:59:22.222 GMT+0
            const timestamp = moment.utc(time).format(INSIGHTS_TIMESTAMP_FORMAT)
            assert.strictEqual(timestamp, '2021-06-20T14:59:22.222+00:00')
        })
    })

    describe('activeTextEditor', function () {
        const fakeTextEditor = {} as vscode.TextEditor

        it('returns undefined for unregistered textEditors', function () {
            assert.strictEqual(registry.getTextEditor(unregisteredUri), undefined)
        })

        it('registers and retrieves textEditor to activeTextEditors', function () {
            assert.strictEqual(registry.getTextEditor(registeredUri), undefined)
            registry.setTextEditor(registeredUri, fakeTextEditor)
            assert.strictEqual(registry.getTextEditor(registeredUri), fakeTextEditor)
        })
    })
})
