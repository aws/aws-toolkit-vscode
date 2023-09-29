/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import { CloudWatchLogsEvent, CloudWatchLogsGroupInfo } from '../registry/logDataRegistry'

export const timestampSpaceEquivalent = '                             '

/**
 * CWL output text can consist of Log Events from multiple different
 * Log Streams. This map type is intended to map a specific line to
 * its respective Log Stream
 */
export type LineToLogStreamMap = Map<number, NonNullable<CloudWatchLogsGroupInfo['streamName']>>

export function generateTextFromLogEvents(
    events: CloudWatchLogsEvent[],
    formatting?: { timestamps?: boolean }
): { text: string; streamIdMap: LineToLogStreamMap } {
    const inlineNewLineRegex = /((\r\n)|\n|\r)(?!$)/g
    // if no timestamp for some reason, entering a blank of equal length (29 characters long)

    const streamIdMap: LineToLogStreamMap = new Map()
    let text: string = ''
    let lineNumber = 0
    for (const event of events) {
        let line: string = event.message ?? ''
        if (formatting?.timestamps) {
            // TODO: Handle different timezones and unix timestamps?
            const timestamp = event.timestamp
                ? moment(event.timestamp).utc().format(INSIGHTS_TIMESTAMP_FORMAT)
                : timestampSpaceEquivalent
            line = timestamp.concat('\t', line)
            // log entries containing newlines are indented to the same length as the timestamp.
            line = line.replace(inlineNewLineRegex, `\n${timestampSpaceEquivalent}\t`)
        }

        if (!line.endsWith('\n')) {
            line = line.concat('\n')
        }

        const lineBreaks = (line.match(/\n/g) || []).length
        if (event.logStreamName) {
            for (let currentLine = lineNumber; currentLine <= lineNumber + lineBreaks - 1; currentLine++) {
                streamIdMap.set(currentLine, event.logStreamName)
            }
        }
        lineNumber += lineBreaks

        text = text.concat(line)
    }
    return { text, streamIdMap }
}
