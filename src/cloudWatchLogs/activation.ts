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
import { LogStreamCodeLensProvider } from './document/logStreamCodeLensProvider'
import { parseCloudWatchLogsUri } from './cloudWatchLogsUtils'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const registry = new LogStreamRegistry()

    const logStreamProvider = new LogStreamDocumentProvider(registry)

    context.subscriptions.push(
        // swap to onDidChangeVisibleTextEditors
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.uri.scheme === CLOUDWATCH_LOGS_SCHEME) {
                registry.deregisterLog(doc.uri)
            }
        })
    )

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(CLOUDWATCH_LOGS_SCHEME, logStreamProvider)
    )

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'log',
                scheme: CLOUDWATCH_LOGS_SCHEME,
            },
            new LogStreamCodeLensProvider()
        )
    )

    context.subscriptions.push(vscode.commands.registerCommand('aws.copyLogStreamName', copyLogStreamName))

    // AWS Explorer right-click action
    // Here instead of in ../awsexplorer/activation due to dependence on the registry.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.cloudWatchLogs.viewLogStream',
            async (node: LogGroupNode) => await viewLogStream(node, registry)
        )
    )
}

function copyLogStreamName(uri: vscode.Uri): void {
    const params = parseCloudWatchLogsUri(uri)

    vscode.env.clipboard.writeText(params.streamName)
}
