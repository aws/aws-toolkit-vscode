/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { viewLogStream } from './commands/viewLogStream'
import { LogStreamDocumentProvider } from './document/logStreamDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogStreamRegistry } from './registry/logStreamRegistry'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const registry = new LogStreamRegistry()

    const logStreamProvider = new LogStreamDocumentProvider(registry)

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(CLOUDWATCH_LOGS_SCHEME, logStreamProvider)
    )

    // AWS Explorer right-click action
    // Here instead of in ../awsexplorer/activation due to dependence on the registry.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.cloudWatchLogs.viewLogStream',
            async (node: LogGroupNode) => await viewLogStream(node, registry)
        )
    )
}
