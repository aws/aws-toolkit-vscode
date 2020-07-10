/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogStreamData, LogStreamRegistry } from '../../../cloudwatchlogs/registry/logStreamRegistry'

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

    const registeredUri = vscode.Uri.parse('has:This')
    const missingRegisteredUri = vscode.Uri.parse('has:Not')

    beforeEach(() => {
        map = new Map<string, CloudWatchLogStreamData>()
        map.set(registeredUri.path, stream)
        registry = new LogStreamRegistry(map)
    })

    describe('hasLog', () => {
        it('correctly returns whether or not the log is registered', () => {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
        })
    })

    describe('addLog', async () => {})

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

    describe('updateLogContent', async () => {})

    describe('deleteLogContent', () => {
        it('deletes a log', () => {
            assert.strictEqual(registry.hasLog(registeredUri), true)
            registry.deleteLogContent(registeredUri)
            assert.strictEqual(registry.hasLog(registeredUri), false)
        })

        it('does not error if the log does not exist in the registry', () => {
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
            registry.deleteLogContent(missingRegisteredUri)
            assert.strictEqual(registry.hasLog(missingRegisteredUri), false)
        })
    })
})
