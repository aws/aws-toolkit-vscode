/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from './constants'

/**
 * The only way to provide a tectDocumentContentProvider knowledge about what it should provide is via the URI
 * This means that we need to mash the log group and log stream together and make it uniformely parseable.
 * Colons are not valid characters in either the group name or stream name and will be used as separators.
 * @param uri URI for a Cloudwatch Logs file
 */
export function convertUriToLogGroupInfo(
    uri: vscode.Uri
): { groupName: string; streamName: string; regionName: string } {
    const parts = uri.path.split(':')

    // splits into <CLOUDWATCH_LOGS_SCHEME>:<groupName>:<streamName>:<regionName>
    if (uri.scheme !== CLOUDWATCH_LOGS_SCHEME || parts.length !== 3) {
        throw new Error(`URI ${uri} is not parseable for CloudWatch Logs`)
    }

    return {
        groupName: parts[0],
        streamName: parts[1],
        regionName: parts[2],
    }
}

export function convertLogGroupInfoToUri(groupName: string, streamName: string, regionName: string): vscode.Uri {
    return vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:${groupName}:${streamName}:${regionName}`)
}
