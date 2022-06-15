/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { Settings } from '../shared/settings'
import { CloudWatchLogsSettings } from './cloudWatchLogsUtils'
import { addLogEvents } from './commands/addLogEvents'
import { copyLogStreamName } from './commands/copyLogStreamName'
import { saveCurrentLogStreamContent } from './commands/saveCurrentLogStreamContent'
import { viewLogStream } from './commands/viewLogStream'
import { searchLogGroup } from './commands/searchLogGroup'
import { LogStreamCodeLensProvider } from './document/logStreamCodeLensProvider'
import { LogStreamDocumentProvider } from './document/logStreamDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogStreamRegistry } from './registry/logStreamRegistry'
import { ExtContext } from '../shared/extensions'

export async function activate(context: ExtContext, configuration: Settings): Promise<void> {
    const settings = new CloudWatchLogsSettings(configuration)
    const registry = new LogStreamRegistry(settings)

    // Pushing to globals.context and ExtContext?

    context.extensionContext.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            CLOUDWATCH_LOGS_SCHEME,
            new LogStreamDocumentProvider(registry)
        )
    )

    context.extensionContext.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.isClosed && doc.uri.scheme === CLOUDWATCH_LOGS_SCHEME) {
                registry.deregisterLog(doc.uri)
            }
        })
    )

    context.extensionContext.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'log',
                scheme: CLOUDWATCH_LOGS_SCHEME,
            },
            new LogStreamCodeLensProvider(registry)
        )
    )

    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.copyLogStreamName', copyLogStreamName)
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.addLogEvents',
            async (
                document: vscode.TextDocument,
                registry: LogStreamRegistry,
                headOrTail: 'head' | 'tail',
                onDidChangeCodeLensEvent: vscode.EventEmitter<void>
            ) => addLogEvents(document, registry, headOrTail, onDidChangeCodeLensEvent)
        )
    )
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.saveCurrentLogStreamContent',
            async (uri?: vscode.Uri) => await saveCurrentLogStreamContent(uri, registry)
        )
    )

    // AWS Explorer right-click action
    // Here instead of in ../awsexplorer/activation due to dependence on the registry.
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.cloudWatchLogs.viewLogStream',
            async (node: LogGroupNode) => await viewLogStream(node, registry)
        )
    )

    // AWS Explore right-click action
    // Copying flow of viewLogStream
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.cloudWatchLogs.searchLogGroup',
            async (node?: LogGroupNode) => await searchLogGroup(context.awsContext, registry, node)
        )
    )
}
