/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { fromExtensionManifest } from '../shared/settings'
import { CloudWatchLogsGroupInfo } from './registry/logStreamRegistry'
import { CloudWatchLogsParameters } from './registry/logStreamRegistry'

// URIs are the only vehicle for delivering information to a TextDocumentContentProvider.
// The following functions are used to structure and destructure relevant information to/from a URI.
// Colons are not valid characters in either the group name or stream name and will be used as separators.

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

export class CloudWatchLogsSettings extends fromExtensionManifest('aws.cloudWatchLogs', { limit: Number }) {}
