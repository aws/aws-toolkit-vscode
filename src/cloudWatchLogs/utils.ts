/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudWatchLogsClient } from '../shared/clients/cloudWatchLogsClient'

export async function* listCloudWatchLogGroups(
    client: CloudWatchLogsClient
): AsyncIterableIterator<CloudWatchLogs.LogGroup> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.logGroups', 'Loading Log Groups...')
    )

    try {
        yield* client.describeLogGroups()
    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}
