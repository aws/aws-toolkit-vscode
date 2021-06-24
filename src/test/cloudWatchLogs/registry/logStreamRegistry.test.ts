/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogStreamData, LogStreamRegistry } from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { CLOUDWATCH_LOGS_SCHEME, INSIGHTS_TIMESTAMP_FORMAT } from '../../../shared/constants'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'

describe('LogStreamRegistry', async function () {
    let registry: LogStreamRegistry
    let map: Map<string, CloudWatchLogStreamData>

    const config = new TestSettingsConfiguration()
    config.writeSetting('cloudWatchLogs.limit', 1000)

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
        busy: false,
    }

    const simplerStream: CloudWatchLogStreamData = {
        data: [
            {
                message: 'short and sweet\n',
            },
        ],
        busy: false,
    }

    const newLineStream: CloudWatchLogStreamData = {
        data: [
            {
                timestamp: 12745641600000,
                message: 'the\nline\rmust\r\nbe\ndrawn\rHERE\nright\nhere\r\nno\nfurther\n',
            },
        ],
        busy: false,
    }

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

    const registeredUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:This:Is:Registered`)
    const shorterRegisteredUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:Less:Is:More`)
    const missingRegisteredUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:Not:Here:Dude`)
    const newLineUri = vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:ANOTHER:LINE:PIEEEECCCEEEEEE`)

    beforeEach(function () {
        map = new Map<string, CloudWatchLogStreamData>()
        map.set(registeredUri.path, stream)
        map.set(shorterRegisteredUri.path, simplerStream)
        map.set(newLineUri.path, newLineStream)
        registry = new LogStreamRegistry(config, map)
    })

    describe('hasLog', function () {
        it('correctly returns whether or not the log is registered', function () {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
        })
    })

    describe('registerLog', async function () {
        it("registers logs and doesn't overwrite existing logs", async () => {
            await registry.registerLog(missingRegisteredUri, getLogEventsFromUriComponentsFn)
            const blankPostRegister = registry.getLogContent(missingRegisteredUri)
            assert.strictEqual(blankPostRegister, newText)

            await registry.registerLog(shorterRegisteredUri, getLogEventsFromUriComponentsFn)
            const preregisteredLog = registry.getLogContent(shorterRegisteredUri)
            assert.strictEqual(preregisteredLog, `${simplerStream.data[0].message}`)
        })
    })

    describe('getLogContent', function () {
        it('gets unformatted log content', function () {
            const text = registry.getLogContent(registeredUri)

            assert.strictEqual(
                text,
                `${stream.data[0].message}${stream.data[1].message}${stream.data[2].message}${stream.data[3].message}`
            )
        })

        it('gets log content formatted to show timestamps', function () {
            const text = registry.getLogContent(registeredUri, { timestamps: true })

            assert.strictEqual(
                text,
                `${moment(1).format(INSIGHTS_TIMESTAMP_FORMAT)}${'\t'}${stream.data[0].message}${moment(2).format(
                    INSIGHTS_TIMESTAMP_FORMAT
                )}${'\t'}${stream.data[1].message}${moment(3).format(INSIGHTS_TIMESTAMP_FORMAT)}${'\t'}${
                    stream.data[2].message
                }                             ${'\t'}${stream.data[3].message}`
            )
        })

        it('indents log entries with newlines of all flavors if timestamps are shown but otherwise does not act on them', function () {
            const timestampText = registry.getLogContent(newLineUri, { timestamps: true })
            const noTimestampText = registry.getLogContent(newLineUri)

            assert.strictEqual(noTimestampText, newLineStream.data[0].message)
            assert.strictEqual(
                timestampText,
                `${moment(newLineStream.data[0].timestamp).format(
                    INSIGHTS_TIMESTAMP_FORMAT
                )}${'\t'}the${'\n'}                             ${'\t'}line${'\n'}                             ${'\t'}must${'\n'}                             ${'\t'}be${'\n'}                             ${'\t'}drawn${'\n'}                             ${'\t'}HERE${'\n'}                             ${'\t'}right${'\n'}                             ${'\t'}here${'\n'}                             ${'\t'}no${'\n'}                             ${'\t'}further\n`
            )
        })
    })

    describe('updateLog', async function () {
        it("adds content to existing streams at both head and tail ends and doesn't do anything if the log isn't registered", async () => {
            await registry.updateLog(shorterRegisteredUri, 'tail', config, getLogEventsFromUriComponentsFn)
            const initialWithTail = registry.getLogContent(shorterRegisteredUri)
            assert.strictEqual(initialWithTail, `${simplerStream.data[0].message}${newText}`)
            await registry.updateLog(shorterRegisteredUri, 'head', config, getLogEventsFromUriComponentsFn)
            const initialWithHeadAndTail = registry.getLogContent(shorterRegisteredUri)
            assert.strictEqual(initialWithHeadAndTail, `${newText}${simplerStream.data[0].message}${newText}`)

            await registry.updateLog(missingRegisteredUri, 'tail', config, getLogEventsFromUriComponentsFn)
            const unregisteredGet = registry.getLogContent(missingRegisteredUri)
            assert.strictEqual(unregisteredGet, undefined)
        })
    })

    describe('deregisterLog', function () {
        it('deletes a log', function () {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            registry.deregisterLog(registeredUri)
            assert.strictEqual(registry.hasLog(registeredUri), false)
        })

        it('does not error if the log does not exist in the registry', function () {
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
            registry.deregisterLog(missingRegisteredUri)
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
        })
    })

    describe('Timestamp', function () {
        it('matches CloudWatch insights timestamps', function() {
            const time = 1624201162222 // 2021-06-20 14:59:22.222 GMT+0
            const timestamp = moment.utc(time).format(INSIGHTS_TIMESTAMP_FORMAT)
            assert.strictEqual(timestamp, '2021-06-20T14:59:22.222+00:00')
        })
    })
})
