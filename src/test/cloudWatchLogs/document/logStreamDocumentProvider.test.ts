/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { CloudWatchLogsSettings } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { LogStreamDocumentProvider } from '../../../cloudWatchLogs/document/logStreamDocumentProvider'
import {
    LogStreamRegistry,
    CloudWatchLogsData,
    getLogEventsFromUriComponents,
} from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { Settings } from '../../../shared/settings'

describe('LogStreamDocumentProvider', function () {
    const map = new Map<string, CloudWatchLogsData>()

    const config = new Settings(vscode.ConfigurationTarget.Workspace)
    const registry = new LogStreamRegistry(new CloudWatchLogsSettings(config), map)

    const registeredUri = vscode.Uri.parse('has:This')
    // TODO: Make this less flaky when we add manual timestamp controls.
    const message = "i'm just putting something here because it's a friday"
    const stream: CloudWatchLogsData = {
        data: [
            {
                message,
            },
        ],
        parameters: { streamName: 'stream' },
        logGroupInfo: {
            groupName: 'group',
            regionName: 'region',
        },
        retrieveLogsFunction: getLogEventsFromUriComponents,
        busy: false,
    }
    const provider = new LogStreamDocumentProvider(registry)
    map.set(registeredUri.path, stream)

    it('provides content if it exists and a blank string if it does not', function () {
        assert.strictEqual(
            provider.provideTextDocumentContent(registeredUri),
            `                             \t${message}\n`
        )
        assert.strictEqual(provider.provideTextDocumentContent(vscode.Uri.parse('has:Not')), '')
    })
})
