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

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            CLOUDWATCH_LOGS_SCHEME,
            new LogStreamDocumentProvider(registry)
        )
    )

    // handle log window closures by discarding logs that aren't shown--do we want this behavior?
    // according to VS Code API docs, onDidChangeVisibleTextEditors is more reliable than onDidCloseTextDocument
    context.subscriptions.push(
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            const logsUriStrings = editors
                .filter(value => value.document.uri.scheme === CLOUDWATCH_LOGS_SCHEME)
                .map(value => value.document.uri.path)
            registry.getRegisteredLogs().forEach(registeredLog => {
                if (!logsUriStrings.includes(registeredLog)) {
                    // parse back to URI, should we change deregisterLog to work directly off strings?
                    registry.deregisterLog(vscode.Uri.parse(`${CLOUDWATCH_LOGS_SCHEME}:${registeredLog}`))
                }
            })
        })
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
