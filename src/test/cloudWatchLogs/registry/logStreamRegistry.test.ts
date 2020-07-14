/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogStreamData, LogStreamRegistry } from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { CLOUDWATCH_LOGS_SCHEME } from '../../../shared/constants'

describe('LogStreamRegistry', async () => {
    let registry: LogStreamRegistry
    let map: Map<string, CloudWatchLogStreamData>
    const stream: CloudWatchLogStreamData = {
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
    }

    const simplerStream: CloudWatchLogStreamData = {
        data: [
            {
                message: 'short and sweet\n',
            },
        ],
    }

    const registeredUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:This:Is:Registered`)
    const shorterRegisteredUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:Less:Is:More`)
    const missingRegisteredUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:Not:Here:Dude`)

    beforeEach(() => {
        map = new Map<string, CloudWatchLogStreamData>()
        map.set(registeredUri.path, stream)
        map.set(shorterRegisteredUri.path, simplerStream)
        registry = new LogStreamRegistry(map)
    })

    describe('hasLog', () => {
        it('correctly returns whether or not the log is registered', () => {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
        })
    })

    describe('getLogContent', () => {
        it('gets unformatted log content', () => {
            const text = registry.getLogContent(registeredUri)

            assert.strictEqual(
                text,
                `${stream.data[0].message}${stream.data[1].message}${stream.data[2].message}${stream.data[3].message}`
            )
        })

        it('gets log content formatted to show timestamps', () => {
            const text = registry.getLogContent(registeredUri, { timestamps: true })

            assert.strictEqual(
                text,
                `${moment(1).format()}${'\t'}${stream.data[0].message}${moment(2).format()}${'\t'}${
                    stream.data[1].message
                }${moment(3).format()}${'\t'}${stream.data[2].message}                             ${'\t'}${
                    stream.data[3].message
                }`
            )
        })
    })

    describe('upsertLog', async () => {
        it('adds content to new streams and to existing streams at both head and tail ends', async () => {
            const newText = 'a little longer now\n'
            const getLogEventsFromUriComponentsFn = async (): Promise<CloudWatchLogs.GetLogEventsResponse> => {
                return {
                    events: [
                        {
                            message: newText,
                        },
                    ],
                }
            }

            await registry.upsertLog(missingRegisteredUri, 'tail', getLogEventsFromUriComponentsFn)
            const blankPostUpsert = registry.getLogContent(missingRegisteredUri)
            assert.strictEqual(blankPostUpsert, newText)

            await registry.upsertLog(shorterRegisteredUri, 'tail', getLogEventsFromUriComponentsFn)
            const initialWithTail = registry.getLogContent(shorterRegisteredUri)
            assert.strictEqual(initialWithTail, `${simplerStream.data[0].message}${newText}`)
            await registry.upsertLog(shorterRegisteredUri, 'head', getLogEventsFromUriComponentsFn)
            const initialWithHeadAndTail = registry.getLogContent(shorterRegisteredUri)
            assert.strictEqual(initialWithHeadAndTail, `${newText}${simplerStream.data[0].message}${newText}`)
        })
    })

    describe('deregisterLog', () => {
        it('deletes a log', () => {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            registry.deregisterLog(registeredUri)
            assert.strictEqual(registry.hasLog(registeredUri), false)
        })

        it('does not error if the log does not exist in the registry', () => {
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
            registry.deregisterLog(missingRegisteredUri)
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
        })
    })
})
