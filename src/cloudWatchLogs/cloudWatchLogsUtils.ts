/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { integer } from 'aws-sdk/clients/cloudfront'
import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { fromExtensionManifest } from '../shared/settings'

// URIs are the only vehicle for delivering information to a TextDocumentContentProvider.
// The following functions are used to structure and destructure relevant information to/from a URI.
// Colons are not valid characters in either the group name or stream name and will be used as separators.

/**
 * Destructures an awsCloudWatchLogs URI into its component pieces.
 * @param uri URI for a Cloudwatch Logs file
 */

type URIParsingFunction = (parts: Array<string>) => {
    groupName: string
    regionName: string
    streamName?: string
    filterParameters?: {
        filterPattern: string
        startTime: integer
    }
}
// TODO: Better way to handle this.
let parsingURIMap = new Map<string, URIParsingFunction>()

parsingURIMap.set('getLogEvents', function (parts) {
    return {
        groupName: parts[1],
        regionName: parts[2],
        streamName: parts[3],
    }
})

parsingURIMap.set('filterLogEvents', function (parts) {
    return {
        groupName: parts[1],
        regionName: parts[2],
        filterParameters: {
            filterPattern: parts[3],
            startTime: Number(parts[4]),
        },
    }
})

export function needsBackwardButton(uri: vscode.Uri): Boolean {
    const parseInfo = parseCloudWatchLogsUri(uri)
    if (parseInfo.filterParameters) {
        return false
    } else {
        return true
    }
}

export function parseCloudWatchLogsUri(uri: vscode.Uri): {
    groupName: string
    regionName: string
    streamName?: string
    filterParameters?: {
        filterPattern: string
        startTime: integer
    }
} {
    const parts = uri.path.split(':')
    const parsingFunction = parsingURIMap.get(parts[0])
    if (parsingFunction) {
        return parsingFunction(parts)
    } else {
        throw new Error(`URI' ${uri} is not parseable for CloudWatch Logs`)
    }

    // splits into <CLOUDWATCH_LOGS_SCHEME>:"<groupName>:<streamName>:<regionName>"
    // if (uri.scheme !== CLOUDWATCH_LOGS_SCHEME || parts.length !== 3) {
    //     throw new Error(`URI ${uri} is not parseable for CloudWatch Logs`)
    // }

    // return {
    //     groupName: parts[0],
    //     regionName: parts[1],
    //     streamName: parts[2],
    // }
}

/**
 * Converts relevant information for CloudWatch Logs Streams into an awsCloudWatchLogs URI
 * @param groupName Log group name
 * @param streamName Log stream name
 * @param regionName AWS region
 */
export function convertLogGroupInfoToUri(
    APICall: string,
    groupName: string,
    regionName: string,
    optionalArgs?: {
        streamName?: string
        filterParameters?: {
            filterPattern: string
            startTime: integer
        }
    }
): vscode.Uri {
    var uriStr = `${CLOUDWATCH_LOGS_SCHEME}:${APICall}:${groupName}:${regionName}`
    if (optionalArgs) {
        if (optionalArgs.streamName) {
            uriStr += `:${optionalArgs.streamName}`
        }
        if (optionalArgs.filterParameters) {
            uriStr += `:${optionalArgs.filterParameters.filterPattern}:${optionalArgs.filterParameters.startTime}`
        }
    }
    return vscode.Uri.parse(uriStr)
}

export class CloudWatchLogsSettings extends fromExtensionManifest('aws.cloudWatchLogs', { limit: Number }) {}
