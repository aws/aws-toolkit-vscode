/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'

export function copyLogStreamName(uri: vscode.Uri): void {
    const parsedUri = parseCloudWatchLogsUri(uri)

    vscode.env.clipboard.writeText(parsedUri.streamName)
}
