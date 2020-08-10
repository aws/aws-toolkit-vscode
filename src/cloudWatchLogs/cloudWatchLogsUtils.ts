/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'

// URIs are the only vehicle for delivering information to a TextDocumentContentProvider.
// The following functions are used to structure and destructure relevant information to/from a URI.
// Colons are not valid characters in either the group name or stream name and will be used as separators.

/**
 * Destructures an awsCloudWatchLogs URI into its component pieces.
 * @param uri URI for a Cloudwatch Logs file
 */
export function parseCloudWatchLogsUri(uri: vscode.Uri): { groupName: string; streamName: string; regionName: string } {
    const parts = uri.path.split(':')

    // splits into <CLOUDWATCH_LOGS_SCHEME>:"<groupName>:<streamName>:<regionName>"
    if (uri.scheme !== CLOUDWATCH_LOGS_SCHEME || parts.length !== 3) {
        throw new Error(`URI ${uri} is not parseable for CloudWatch Logs`)
    }

    return {
        groupName: parts[0],
        streamName: parts[1],
        regionName: parts[2],
    }
}

/**
 * Converts relevant information for CloudWatch Logs Streams into an awsCloudWatchLogs URI
 * @param groupName Log group name
 * @param streamName Log stream name
 * @param regionName AWS region
 */
export function convertLogGroupInfoToUri(groupName: string, streamName: string, regionName: string): vscode.Uri {
    return vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:${groupName}:${streamName}:${regionName}`)
}
