/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { fromExtensionManifest } from '../shared/settings'
import { CloudWatchLogsGroupInfo, parametersStringValue } from './registry/logStreamRegistry'
import { CloudWatchLogsParameters } from './registry/logStreamRegistry'

// URIs are the only vehicle for delivering information to a TextDocumentContentProvider.
// The following functions are used to structure and destructure relevant information to/from a URI.
// Colons are not valid characters in either the group name or stream name and will be used as separators.

let parsingURIMap = new Map<string, URIParsingFunction>()

parsingURIMap.set('viewLogStream', function (parts) {
    return {
        logGroupInfo: {
            groupName: parts[1],
            regionName: parts[2],
            streamName: parts[3],
        },
        parameters: {},
    }
})

parsingURIMap.set('searchLogGroup', function (parts) {
    return {
        logGroupInfo: {
            groupName: parts[1],
            regionName: parts[2],
        },
        parameters: {
            filterPattern: parts[3],
            startTime: Number(parts[4]),
        },
    }
})

/**
 * Destructures an awsCloudWatchLogs URI into its component pieces.
 * @param uri URI for a Cloudwatch Logs file
 */
export function parseCloudWatchLogsUri(uri: vscode.Uri): {
    logGroupInfo: CloudWatchLogsGroupInfo
    parameters: CloudWatchLogsParameters
} {
    const parts = uri.path.split(':')
    const action = parts[0]

    const parsingFunction = parsingURIMap.get(action)

    if (uri.scheme !== CLOUDWATCH_LOGS_SCHEME || !parsingFunction) {
        throw new Error(`URI ${uri} is not parseable for CloudWatch Logs`)
    }

    return parsingFunction(parts)
}

/**
 * Converts relevant information for CloudWatch Logs Streams into an awsCloudWatchLogs URI
 * @param groupName Log group name
 * @param streamName Log stream name
 * @param regionName AWS region
 */
export function createURIFromArgs(
    action: string,
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters
): vscode.Uri {
    let uriStr = `${CLOUDWATCH_LOGS_SCHEME}:${action}:${logGroupInfo.groupName}:${logGroupInfo.regionName}`

    if (logGroupInfo.streamName) {
        uriStr += `:${logGroupInfo.streamName}`
    }

    uriStr += parametersStringValue(parameters)
    return vscode.Uri.parse(uriStr)
}

export class CloudWatchLogsSettings extends fromExtensionManifest('aws.cloudWatchLogs', { limit: Number }) {}

type URIParsingFunction = (parts: Array<string>) => {
    logGroupInfo: CloudWatchLogsGroupInfo
    parameters: CloudWatchLogsParameters
}
