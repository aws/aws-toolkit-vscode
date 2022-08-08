/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { Settings } from '../shared/settings'
import { CloudWatchLogsSettings, isLogStreamUri } from './cloudWatchLogsUtils'
import { addLogEvents } from './commands/addLogEvents'
import { copyLogStreamName } from './commands/copyLogStreamName'
import { saveCurrentLogStreamContent } from './commands/saveCurrentLogStreamContent'
import { viewLogStream } from './commands/viewLogStream'
import { LogStreamCodeLensProvider } from './document/logStreamCodeLensProvider'
import { LogStreamDocumentProvider } from './document/logStreamDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogStreamRegistry } from './registry/logStreamRegistry'
import { Commands } from '../shared/vscode/commands2'
import { searchLogGroup } from './commands/searchLogGroup'
import { changeLogSearchParams } from './changeLogSearch'
import { CloudWatchLogsNode } from './explorer/cloudWatchLogsNode'

export async function activate(context: vscode.ExtensionContext, configuration: Settings): Promise<void> {
    const settings = new CloudWatchLogsSettings(configuration)
    const registry = new LogStreamRegistry(settings)

    const documentProvider = new LogStreamDocumentProvider(registry)

    vscode.languages.registerDefinitionProvider(
        // TODO: figure out how to only show "Jump to definition" for documents from searches
        { language: 'log', scheme: CLOUDWATCH_LOGS_SCHEME },
        documentProvider
    )

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(CLOUDWATCH_LOGS_SCHEME, documentProvider)
    )

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.isClosed && doc.uri.scheme === CLOUDWATCH_LOGS_SCHEME) {
                registry.disposeRegistryData(doc.uri)
            }
        }),
        vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
            const eventUri = event.document.uri
            if (registry.hasLog(eventUri) && !isLogStreamUri(eventUri)) {
                registry.highlightDocument(eventUri)
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

    context.subscriptions.push(Commands.register('aws.copyLogStreamName', copyLogStreamName))
    context.subscriptions.push(
        Commands.register(
            'aws.addLogEvents',
            async (
                document: vscode.TextDocument,
                registry: LogStreamRegistry,
                headOrTail: 'head' | 'tail',
                onDidChangeCodeLensEvent: vscode.EventEmitter<void>
            ) => addLogEvents(document, registry, headOrTail, onDidChangeCodeLensEvent)
        ),
        Commands.register(
            'aws.saveCurrentLogStreamContent',
            async (uri?: vscode.Uri) => await saveCurrentLogStreamContent(uri, registry)
        ),
        // AWS Explorer right-click action
        // Here instead of in ../awsexplorer/activation due to dependence on the registry.
        Commands.register('aws.cwl.viewLogStream', async (node: LogGroupNode) => await viewLogStream(node, registry)),

        Commands.register(
            'aws.cwl.searchLogGroup',
            async (node: LogGroupNode | CloudWatchLogsNode) =>
                await searchLogGroup(node instanceof LogGroupNode ? node : undefined, registry)
        ),

        Commands.register('aws.cwl.changeFilterPattern', async () => changeLogSearchParams(registry, 'filterPattern')),

        Commands.register('aws.cwl.changeTimeFilter', async () => changeLogSearchParams(registry, 'timeFilter'))
    )
}
