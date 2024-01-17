/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import {
    LogDataRegistry,
    CloudWatchLogsAction,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    CloudWatchLogsResponse,
    CloudWatchLogsData,
} from '../../../cloudWatchLogs/registry/logDataRegistry'
import { Settings } from '../../../shared/settings'
import { CloudWatchLogsSettings, createURIFromArgs } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import {
    backwardToken,
    fakeGetLogEvents,
    fakeSearchLogGroup,
    logGroupsData,
    newLineData,
    paginatedData,
    testLogData,
    unregisteredData,
} from '../utils.test'
import { CloudWatchLogs } from 'aws-sdk'
import { FilteredLogEvents } from 'aws-sdk/clients/cloudwatchlogs'
import { formatDateTimestamp } from '../../../shared/utilities/textUtilities'

describe('LogDataRegistry', async function () {
    let registry: GetSetLogDataRegistry

    const config = new Settings(vscode.ConfigurationTarget.Workspace)

    const registeredUri = createURIFromArgs(testLogData.logGroupInfo, testLogData.parameters)
    const unregisteredUri = createURIFromArgs(unregisteredData.logGroupInfo, unregisteredData.parameters)
    const newLineUri = createURIFromArgs(newLineData.logGroupInfo, newLineData.parameters)
    const searchLogGroupUri = createURIFromArgs(logGroupsData.logGroupInfo, logGroupsData.parameters)
    const paginatedUri = createURIFromArgs(paginatedData.logGroupInfo, paginatedData.parameters)

    /**
     * Only intended to expose the {get|set}LogData methods for testing purposes.
     */
    class GetSetLogDataRegistry extends LogDataRegistry {
        override getLogData(uri: vscode.Uri): CloudWatchLogsData | undefined {
            return super.getLogData(uri)
        }

        override setLogData(uri: vscode.Uri, newData: CloudWatchLogsData): void {
            super.setLogData(uri, newData)
        }
    }

    beforeEach(function () {
        registry = new GetSetLogDataRegistry(new CloudWatchLogsSettings(config))
        registry.setLogData(registeredUri, testLogData)
        registry.setLogData(newLineUri, newLineData)
        registry.setLogData(searchLogGroupUri, logGroupsData)
        registry.setLogData(paginatedUri, paginatedData)
    })

    describe('hasLog', function () {
        it('correctly returns whether or not the log is registered', function () {
            assert.strictEqual(registry.isRegistered(registeredUri), true)
            assert.strictEqual(registry.isRegistered(unregisteredUri), false)
        })
    })

    describe('registerInitialLog', function () {
        it('throws when attempting to register a pre-existing uri', () => {
            assert.throws(() => {
                registry.registerInitialLog(registeredUri)
            }, new Error(`Already registered: ${registeredUri.toString()}`))
        })
    })

    describe('fetchNextLogEvents head/tail management', async function () {
        beforeEach(() => {
            // Verify existing data
            const oldEvents = registry.fetchCachedLogEvents(paginatedUri)
            assert.deepStrictEqual(oldEvents, paginatedData.events)
        })

        it("properly paginates the results with 'head'", async () => {
            // Manually set a backwards token to exist
            registry.setLogData(paginatedUri, { ...paginatedData, previous: { token: backwardToken } })

            const newEvents = await registry.fetchNextLogEvents(paginatedUri, 'head')

            // // check that newData is changed to what it should be.
            const expected = (await fakeSearchLogGroup()).events
            assert.deepStrictEqual(newEvents, expected)
        })

        it("properly paginates the results with 'tail'", async () => {
            const newEvents = await registry.fetchNextLogEvents(paginatedUri, 'tail')

            // // check that newData is changed to what it should be.
            const expected = (await fakeGetLogEvents()).events
            assert.deepStrictEqual(newEvents, expected)
        })

        it("returns empty list if no 'head' token", async () => {
            const newEvents = await registry.fetchNextLogEvents(paginatedUri, 'head')
            // // check that newData is changed to what it should be.
            assert.deepStrictEqual(newEvents, [])
        })
    })

    describe('fetchNextLogEvents pagination handling', async function () {
        const pageToken0 = undefined // Absence of token implies inital page
        const pageToken1 = 'page1Token'
        const pageToken2 = 'page2Token'

        function createCwlEvents(id: string, count: number): FilteredLogEvents {
            let events: CloudWatchLogs.FilteredLogEvents = []
            for (let i = 0; i < count; i++) {
                events = events.concat({ message: `message-${id}`, logStreamName: `stream-${id}` })
            }
            return events
        }

        async function buildCwlAction(isPage1Empty: boolean): Promise<CloudWatchLogsAction> {
            return async function (
                logGroupInfo: CloudWatchLogsGroupInfo,
                parameters: CloudWatchLogsParameters,
                nextToken?: CloudWatchLogs.NextToken
            ) {
                return getSimulatedCwlResponse(nextToken, isPage1Empty)
            }
        }

        /**
         * This function returns a simulated cloud watch logs reponse for a given token.
         * @param token The page token
         * @param isPage1Empty A flag to indicate if Page 1 should have data/isn't the tail.
         * @returns
         */
        function getSimulatedCwlResponse(
            token: CloudWatchLogs.NextToken | undefined,
            isPage1Empty: boolean
        ): CloudWatchLogsResponse {
            switch (token) {
                case pageToken1:
                    if (isPage1Empty) {
                        return { events: [], nextForwardToken: undefined, nextBackwardToken: pageToken0 }
                    }
                    return {
                        events: createCwlEvents('P1', 1),
                        nextForwardToken: pageToken2,
                        nextBackwardToken: pageToken0,
                    }
                case pageToken2:
                    return { events: [], nextForwardToken: undefined, nextBackwardToken: pageToken1 }
                default: // pageToken0
                    return {
                        events: createCwlEvents('P0', 1),
                        nextForwardToken: pageToken1,
                        nextBackwardToken: undefined,
                    }
            }
        }

        it('can retrieve new events when they become available', async () => {
            // Swap to use other paginate testing function
            const noEventsOnPage1 = true
            paginatedData.retrieveLogsFunction = await buildCwlAction(noEventsOnPage1)

            // -- Make first call.
            const firstUpdatedEvents = await registry.fetchNextLogEvents(paginatedUri)
            const firstExpectedEvents = getSimulatedCwlResponse(pageToken0, noEventsOnPage1).events
            assert.deepStrictEqual(firstUpdatedEvents, firstExpectedEvents)

            // -- Make second call.
            const secondUpdatedData = await registry.fetchNextLogEvents(paginatedUri)
            // Expect the output to equal the first call since page 1 'does not exist yet'
            assert.deepStrictEqual(secondUpdatedData, firstExpectedEvents)

            // Simulate page 1 now getting data
            const logData = registry.getLogData(paginatedUri)
            assert(logData)
            logData.retrieveLogsFunction = await buildCwlAction(!noEventsOnPage1)

            // -- Make third call.
            const thirdActual = await registry.fetchNextLogEvents(paginatedUri)
            const thirdExpected = firstExpectedEvents.concat(
                getSimulatedCwlResponse(pageToken1, !noEventsOnPage1).events
            )
            assert.deepStrictEqual(thirdActual, thirdExpected)
        })
    })

    describe('disposeRegistryData', function () {
        it('deletes a log', function () {
            assert.strictEqual(registry.isRegistered(registeredUri), true)
            registry.disposeRegistryData(registeredUri)
            assert.strictEqual(registry.isRegistered(registeredUri), false)
        })

        it('does not error if the log does not exist in the registry', function () {
            assert.strictEqual(registry.isRegistered(unregisteredUri), false)
            registry.disposeRegistryData(unregisteredUri)
            assert.strictEqual(registry.isRegistered(unregisteredUri), false)
        })
    })

    describe('Timestamp', function () {
        it('matches CloudWatch insights timestamps', function () {
            const time = 1624201162222 // 2021-06-20 14:59:22.222 GMT+0
            const timestamp = formatDateTimestamp(true, new Date(time))
            assert.strictEqual(timestamp, '2021-06-20T14:59:22.222-07:00')
        })
    })
})
