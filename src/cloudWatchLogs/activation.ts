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
import { LogStreamCodeLensProvider } from './document/logStreamCodeLensProvider'
import { LogStreamDocumentProvider } from './document/logStreamDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogStreamRegistry } from './registry/logStreamRegistry'
import { Commands } from '../shared/vscode/commands2'
import { searchLogGroup } from './commands/searchLogGroup'
import { changeLogSearchParams } from './changeLogSearch'
import { JumpToStream } from './commands/searchLogGroup'

export async function activate(context: vscode.ExtensionContext, configuration: Settings): Promise<void> {
    const settings = new CloudWatchLogsSettings(configuration)
    const registry = new LogStreamRegistry(settings)

    const definitionProvider = new JumpToStream(registry)
    vscode.languages.registerDefinitionProvider(
        { language: 'log', scheme: CLOUDWATCH_LOGS_SCHEME, pattern: '.*:.+' },
        definitionProvider
    )

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

        Commands.register('aws.cwl.searchLogGroup', async (node: LogGroupNode) => await searchLogGroup(node, registry)),

        Commands.register('aws.cwl.changeFilterPattern', async () => changeLogSearchParams(registry, 'filterPattern')),

        Commands.register('aws.cwl.changeTimeFilter', async () => changeLogSearchParams(registry, 'timeFilter'))
    )
}
