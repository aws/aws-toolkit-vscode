/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { SettingsConfiguration } from '../shared/settingsConfiguration'
import { addLogEvents } from './commands/addLogEvents'
import { copyLogStreamName } from './commands/copyLogStreamName'
import { saveCurrentLogStreamContent } from './commands/saveCurrentLogStreamContent'
import { viewLogStream } from './commands/viewLogStream'
import { LogStreamCodeLensProvider } from './document/logStreamCodeLensProvider'
import { LogStreamDocumentProvider } from './document/logStreamDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogStreamRegistry } from './registry/logStreamRegistry'

export async function activate(context: vscode.ExtensionContext, configuration: SettingsConfiguration): Promise<void> {
    const registry = new LogStreamRegistry(configuration)

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            CLOUDWATCH_LOGS_SCHEME,
            new LogStreamDocumentProvider(registry)
        )
    )

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.isClosed && doc.uri.scheme === CLOUDWATCH_LOGS_SCHEME) {
                registry.deregisterLog(doc.uri)
            }
        })
    )

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'log',
                scheme: CLOUDWATCH_LOGS_SCHEME,
            },
            new LogStreamCodeLensProvider(registry)
        )
    )

    context.subscriptions.push(vscode.commands.registerCommand('aws.copyLogStreamName', copyLogStreamName))
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.addLogEvents',
            async (
                document: vscode.TextDocument,
                registry: LogStreamRegistry,
                headOrTail: 'head' | 'tail',
                onDidChangeCodeLensEvent: vscode.EventEmitter<void>
            ) => addLogEvents(document, registry, headOrTail, onDidChangeCodeLensEvent, configuration)
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.saveCurrentLogStreamContent',
            async (uri?: vscode.Uri) => await saveCurrentLogStreamContent(uri, registry)
        )
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
