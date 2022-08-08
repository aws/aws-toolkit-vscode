/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { fromExtensionManifest } from '../shared/settings'
import { CloudWatchLogsData, CloudWatchLogsGroupInfo } from './registry/logStreamRegistry'
import { CloudWatchLogsParameters } from './registry/logStreamRegistry'

// URIs are the only vehicle for delivering information to a TextDocumentContentProvider.
// The following functions are used to structure and destructure relevant information to/from a URI.
// Colons are not valid characters in either the group name or stream name and will be used as separators.

export function telemetryFilterSuccess(
    logData: CloudWatchLogsData,
    resourceType: telemetry.CloudWatchResourceType
): void {
    telemetry.recordCloudwatchlogsFilter({
        result: 'Succeeded',
        cloudWatchResourceType: resourceType,
        hasTimeFilter: logData.parameters.startTime ? true : false,
        hasTextFilter: logData.parameters.filterPattern && logData.parameters.filterPattern !== '' ? true : false,
    })
}

/**
 * This function concatenates the path and query to create a unique (enough) identifier for a URI.
 * @param uri
 * @returns
 */
export function uriToKey(uri: vscode.Uri): string {
    if (uri.query) {
        try {
            const { filterPattern, startTime, endTime, limit, streamName, streamNameOptions } =
                parseCloudWatchLogsUri(uri).parameters
            const parts = [uri.path, filterPattern, startTime, endTime, limit, streamName, streamNameOptions]
            return parts.map(p => p ?? '').join(':')
        } catch {
            throw new Error(
                `Unable to parse ${uri.query} into JSON and therefore cannot key uri with path: ${uri.path}`
            )
        }
    }
    return uri.path
}

/**
 * Destructures an awsCloudWatchLogs URI into its component pieces.
 * @param uri URI for a Cloudwatch Logs file
 */
export function parseCloudWatchLogsUri(uri: vscode.Uri): {
    logGroupInfo: CloudWatchLogsGroupInfo
    parameters: CloudWatchLogsParameters
} {
    const parts = uri.path.split(':')

    if (uri.scheme !== CLOUDWATCH_LOGS_SCHEME) {
        throw new Error(`URI ${uri} is not parseable for CloudWatch Logs`)
    }

    return {
        logGroupInfo: {
            groupName: parts[0],
            regionName: parts[1],
        },
        parameters: JSON.parse(uri.query),
    }
}
/**
 * Determines if loadOlder codelense should be visible on virtual document
 * @param uri CloudWatchLogs Document URI
 * @returns
 */
export function isLogStreamUri(uri: vscode.Uri): boolean {
    const params = parseCloudWatchLogsUri(uri).parameters
    return params.streamName !== undefined
}

/**
 * Converts relevant information for CloudWatch Logs Streams into an awsCloudWatchLogs URI
 * @param groupName Log group name
 * @param streamName Log stream name
 * @param regionName AWS region
 */
export function createURIFromArgs(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters
): vscode.Uri {
    let uriStr = `${CLOUDWATCH_LOGS_SCHEME}:${logGroupInfo.groupName}:${logGroupInfo.regionName}`

    uriStr += `?${encodeURIComponent(JSON.stringify(parameters))}`
    return vscode.Uri.parse(uriStr)
}

/**
 * Finds occurences of text in the document.
 * @param document
 * @param keyword
 * @returns Ranges where pattern occurrs in document.
 */
export function findOccurencesOf(document: vscode.TextDocument, keyword: string): vscode.Range[] {
    const ranges: vscode.Range[] = []
    let lineNum = 0

    keyword = keyword.toLowerCase()

    while (lineNum < document.lineCount) {
        const currentLine = document.lineAt(lineNum)
        const currentLineText = currentLine.text.toLowerCase()
        let indexOccurrence = currentLineText.indexOf(keyword, 0)

        while (indexOccurrence >= 0) {
            ranges.push(
                new vscode.Range(
                    new vscode.Position(lineNum, indexOccurrence),
                    new vscode.Position(lineNum, indexOccurrence + keyword.length)
                )
            )
            indexOccurrence = currentLineText.indexOf(keyword, indexOccurrence + 1)
        }
        lineNum += 1
    }
    return ranges
}

export class CloudWatchLogsSettings extends fromExtensionManifest('aws.cwl', { limit: Number }) {}
