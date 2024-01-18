/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { generateTextFromLogEvents, timestampSpaceEquivalent } from '../../../cloudWatchLogs/document/textContent'
import { CloudWatchLogsEvent } from '../../../cloudWatchLogs/registry/logDataRegistry'

describe('generateTextFromLogEvents', function () {
    it('no formatting', () => {
        const events: CloudWatchLogsEvent[] = [
            { message: 'The first log event', logStreamName: 'stream1' },
            { message: 'The second log event', logStreamName: 'stream2' },
        ]

        const { text, streamIdMap } = generateTextFromLogEvents(events)

        const expectedText = `The first log event
The second log event
`
        const expectedStreamIdMap = new Map([
            [0, 'stream1'],
            [1, 'stream2'],
        ])
        assert.strictEqual(text, expectedText)
        assert.deepStrictEqual(streamIdMap, expectedStreamIdMap)
    })

    it('has timestamps', () => {
        const events: CloudWatchLogsEvent[] = [
            { message: 'The first log event', logStreamName: 'stream1', timestamp: 1675451113 },
            { message: 'The second log event', logStreamName: 'stream2', timestamp: 1675451114 },
        ]

        const { text, streamIdMap } = generateTextFromLogEvents(events, { timestamps: true })

        const expectedText = `1970-01-20T09:24:11.113-08:00\tThe first log event
1970-01-20T09:24:11.114-08:00\tThe second log event
`
        const expectedStreamIdMap = new Map([
            [0, 'stream1'],
            [1, 'stream2'],
        ])
        assert.strictEqual(text, expectedText)
        assert.deepStrictEqual(streamIdMap, expectedStreamIdMap)
    })

    it('has a multiline message + timestamps', () => {
        const events: CloudWatchLogsEvent[] = [
            { message: 'The first log event', logStreamName: 'stream1', timestamp: 1675451113 },
            {
                message: 'The second log event\nwith another line\nand another',
                logStreamName: 'stream2',
                timestamp: 1675451114,
            },
        ]

        const { text, streamIdMap } = generateTextFromLogEvents(events, { timestamps: true })

        const expectedText = `1970-01-20T09:24:11.113-08:00\tThe first log event
1970-01-20T09:24:11.114-08:00\tThe second log event
${timestampSpaceEquivalent}\twith another line
${timestampSpaceEquivalent}\tand another
`

        const expectedStreamIdMap = new Map([
            [0, 'stream1'],
            [1, 'stream2'],
            [2, 'stream2'],
            [3, 'stream2'],
        ])
        assert.strictEqual(text, expectedText)
        assert.deepStrictEqual(streamIdMap, expectedStreamIdMap)
    })
})
