/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../shared/constants'
import { Settings } from '../shared/settings'
import { addLogEvents } from './commands/addLogEvents'
import { copyLogResource } from './commands/copyLogResource'
import { saveCurrentLogDataContent } from './commands/saveCurrentLogDataContent'
import { selectLogStream } from './commands/viewLogStream'
import { LogDataCodeLensProvider } from './document/logDataCodeLensProvider'
import { LogDataDocumentProvider } from './document/logDataDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogDataRegistry } from './registry/logDataRegistry'
import { Commands } from '../shared/vscode/commands2'
import { searchLogGroup } from './commands/searchLogGroup'
import { updateLogSearch as updateLogSearch } from './changeLogSearch'
import { CloudWatchLogsNode } from './explorer/cloudWatchLogsNode'
import { openLogStreamFile, LogStreamCodeLensProvider } from './document/logStreamsCodeLensProvider'

export async function activate(context: vscode.ExtensionContext, configuration: Settings): Promise<void> {
    const registry = LogDataRegistry.instance

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

    context.subscriptions.push(Commands.register('aws.copyLogResource', copyLogResource))
    context.subscriptions.push(
        // For codelenses "Load newer events", "Load older events".
        Commands.register(
            'aws.addLogEvents',
            async (
                document: vscode.TextDocument,
                registry: LogDataRegistry,
                headOrTail: 'head' | 'tail',
                onDidChangeCodeLensEvent: vscode.EventEmitter<void>
            ) => addLogEvents(document, registry, headOrTail, onDidChangeCodeLensEvent)
        ),
        Commands.register('aws.saveCurrentLogDataContent', async () => await saveCurrentLogDataContent()),
        Commands.register('aws.cwl.viewLogStream', async (node: LogGroupNode) => await selectLogStream(node, registry)),
        Commands.register('aws.loadLogStreamFile', async (uri: vscode.Uri, registry: LogDataRegistry) =>
            openLogStreamFile(uri, registry)
        ),

        Commands.register('aws.cwl.searchLogGroup', async (node: LogGroupNode | CloudWatchLogsNode) => {
            const logGroupInfo =
                node instanceof LogGroupNode
                    ? { regionName: node.regionCode, groupName: node.logGroup.logGroupName! }
                    : undefined
            const source = node ? (logGroupInfo ? 'ExplorerLogGroupNode' : 'ExplorerServiceNode') : 'Command'
            await searchLogGroup(registry, source, logGroupInfo)
        }),

        Commands.register('aws.cwl.changeFilterPattern', async () => updateLogSearch(registry, 'filterPattern')),
        Commands.register('aws.cwl.changeTimeFilter', async () => updateLogSearch(registry, 'timeFilter'))
    )
}
