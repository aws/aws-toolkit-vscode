/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LogStreamDocumentProvider } from './document/logStreamDocumentProvider'
import { CLOUDWATCH_LOGS_SCHEME } from './constants'
import { LogStreamRegistry } from './registry/logStreamRegistry'
import { viewLogStream } from './commands/viewLogStream'
import { LogGroupNode } from './explorer/logGroupNode'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const registry = new LogStreamRegistry()

    const logStreamProvider = new LogStreamDocumentProvider(registry)

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(CLOUDWATCH_LOGS_SCHEME, logStreamProvider)
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.cloudWatchLogs.viewLogStream',
            async (node: LogGroupNode) => await viewLogStream(node, registry)
        )
    )
}
