/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { LogStreamDocumentProvider } from '../../../cloudWatchLogs/document/logStreamDocumentProvider'
import { LogStreamRegistry, CloudWatchLogStreamData } from '../../../cloudWatchLogs/registry/logStreamRegistry'

describe('LogStreamDocumentProvider', () => {
    let registry: LogStreamRegistry
    let map: Map<string, CloudWatchLogStreamData>
    let provider: LogStreamDocumentProvider

    const registeredUri = vscode.Uri.parse('has:This')
    // TODO: Make this less flaky when we add manual timestamp controls.
    const message = "i'm just putting something here because it's a friday"
    const stream: CloudWatchLogStreamData = {
        data: [
            {
                message,
            },
        ],
    }

    beforeEach(() => {
        map = new Map<string, CloudWatchLogStreamData>()
        map.set(registeredUri.path, stream)
        registry = new LogStreamRegistry(map)
        provider = new LogStreamDocumentProvider(registry)
    })

    it('provides content if it exists and a blank string if it does not', () => {
        assert.strictEqual(
            provider.provideTextDocumentContent(registeredUri),
            `                             \t${message}\n`
        )
        assert.strictEqual(provider.provideTextDocumentContent(vscode.Uri.parse('has:Not')), '')
    })
})
