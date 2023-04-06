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
import { saveCurrentLogDataContent } from './commands/saveCurrentLogDataContent'
import { viewLogStream } from './commands/viewLogStream'
import { LogDataCodeLensProvider } from './document/logDataCodeLensProvider'
import { LogDataDocumentProvider } from './document/logDataDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogDataRegistry } from './registry/logDataRegistry'
import { Commands } from '../shared/vscode/commands2'
import { searchLogGroup } from './commands/searchLogGroup'
import { changeLogSearchParams } from './changeLogSearch'
import { CloudWatchLogsNode } from './explorer/cloudWatchLogsNode'
import { loadAndOpenInitialLogStreamFile, LogStreamCodeLensProvider } from './document/logStreamsCodeLensProvider'

export async function activate(context: vscode.ExtensionContext, configuration: Settings): Promise<void> {
    const settings = new CloudWatchLogsSettings(configuration)
    const registry = new LogDataRegistry(settings)

    const documentProvider = new LogDataDocumentProvider(registry)

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'log',
                scheme: CLOUDWATCH_LOGS_SCHEME,
            },
            new LogStreamCodeLensProvider(registry, documentProvider)
        )
    )

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(CLOUDWATCH_LOGS_SCHEME, documentProvider)
    )

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.isClosed && doc.uri.scheme === CLOUDWATCH_LOGS_SCHEME) {
                registry.disposeRegistryData(doc.uri)
            }
        })
    )

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'log',
                scheme: CLOUDWATCH_LOGS_SCHEME,
            },
            new LogDataCodeLensProvider(registry)
        )
    )

    context.subscriptions.push(
        Commands.register('aws.loadLogStreamFile', async (uri: vscode.Uri, registry: LogDataRegistry) =>
            loadAndOpenInitialLogStreamFile(uri, registry)
        )
    )
    context.subscriptions.push(Commands.register('aws.copyLogStreamName', copyLogStreamName))
    context.subscriptions.push(
        Commands.register(
            'aws.addLogEvents',
            async (
                document: vscode.TextDocument,
                registry: LogDataRegistry,
                headOrTail: 'head' | 'tail',
                onDidChangeCodeLensEvent: vscode.EventEmitter<void>
            ) => addLogEvents(document, registry, headOrTail, onDidChangeCodeLensEvent)
        ),
        Commands.register(
            'aws.saveCurrentLogDataContent',
            async (uri?: vscode.Uri) => await saveCurrentLogDataContent(uri, registry)
        ),
        // AWS Explorer right-click action
        // Here instead of in ../awsexplorer/activation due to dependence on the registry.
        Commands.register('aws.cwl.viewLogStream', async (node: LogGroupNode) => await viewLogStream(node, registry)),

        Commands.register('aws.cwl.searchLogGroup', async (node: LogGroupNode | CloudWatchLogsNode) => {
            let logGroupInfo = undefined

            if (node instanceof LogGroupNode) {
                logGroupInfo = { regionName: node.regionCode, groupName: node.logGroup.logGroupName! }
            }

            await searchLogGroup(registry, logGroupInfo)
        }),

        Commands.register('aws.cwl.changeFilterPattern', async () => changeLogSearchParams(registry, 'filterPattern')),

        Commands.register('aws.cwl.changeTimeFilter', async () => changeLogSearchParams(registry, 'timeFilter'))
    )
}
