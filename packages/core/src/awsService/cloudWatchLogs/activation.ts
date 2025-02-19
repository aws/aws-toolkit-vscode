/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cloudwatchLogsLiveTailScheme, CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'
import { Settings } from '../../shared/settings'
import { addLogEvents } from './commands/addLogEvents'
import { copyLogResource } from './commands/copyLogResource'
import { saveCurrentLogDataContent } from './commands/saveCurrentLogDataContent'
import { viewLogStream } from './commands/viewLogStream'
import { LogDataCodeLensProvider } from './document/logDataCodeLensProvider'
import { LogDataDocumentProvider } from './document/logDataDocumentProvider'
import { LogGroupNode } from './explorer/logGroupNode'
import { LogDataRegistry } from './registry/logDataRegistry'
import { Commands } from '../../shared/vscode/commands2'
import { searchLogGroup } from './commands/searchLogGroup'
import { changeLogSearchParams } from './changeLogSearch'
import { CloudWatchLogsNode } from './explorer/cloudWatchLogsNode'
import { loadAndOpenInitialLogStreamFile, LogStreamCodeLensProvider } from './document/logStreamsCodeLensProvider'
import { clearDocument, closeSession, tailLogGroup } from './commands/tailLogGroup'
import { LiveTailDocumentProvider } from './document/liveTailDocumentProvider'
import { LiveTailSessionRegistry } from './registry/liveTailSessionRegistry'
import { DeployedResourceNode } from '../appBuilder/explorer/nodes/deployedNode'
import { isTreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { LiveTailCodeLensProvider } from './document/liveTailCodeLensProvider'

export const liveTailRegistry = LiveTailSessionRegistry.instance
export const liveTailCodeLensProvider = new LiveTailCodeLensProvider(liveTailRegistry)
export async function activate(context: vscode.ExtensionContext, configuration: Settings): Promise<void> {
    const registry = LogDataRegistry.instance

    const documentProvider = new LogDataDocumentProvider(registry)
    const liveTailDocumentProvider = new LiveTailDocumentProvider()
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
        vscode.languages.registerCodeLensProvider(
            {
                language: 'log',
                scheme: cloudwatchLogsLiveTailScheme,
            },
            liveTailCodeLensProvider
        )
    )

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(cloudwatchLogsLiveTailScheme, liveTailDocumentProvider)
    )

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => {
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
    context.subscriptions.push(Commands.register('aws.copyLogResource', copyLogResource))
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
        Commands.register('aws.saveCurrentLogDataContent', async () => await saveCurrentLogDataContent()),
        // AWS Explorer right-click action
        // Here instead of in ../awsexplorer/activation due to dependence on the registry.
        Commands.register('aws.cwl.viewLogStream', async (node: LogGroupNode) => await viewLogStream(node, registry)),

        Commands.register('aws.cwl.searchLogGroup', async (node: LogGroupNode | CloudWatchLogsNode) => {
            const logGroupInfo =
                node instanceof LogGroupNode
                    ? { regionName: node.regionCode, groupName: node.logGroup.logGroupName! }
                    : undefined
            const source = node ? (logGroupInfo ? 'ExplorerLogGroupNode' : 'ExplorerServiceNode') : 'Command'
            await searchLogGroup(registry, source, logGroupInfo)
        }),

        Commands.register('aws.cwl.changeFilterPattern', async () => changeLogSearchParams(registry, 'filterPattern')),

        Commands.register('aws.cwl.changeTimeFilter', async () => changeLogSearchParams(registry, 'timeFilter')),

        Commands.register('aws.cwl.tailLogGroup', async (node: LogGroupNode | CloudWatchLogsNode) => {
            const logGroupInfo =
                node instanceof LogGroupNode
                    ? { regionName: node.regionCode, groupName: node.logGroup.logGroupName! }
                    : undefined
            const source = node ? (logGroupInfo ? 'ExplorerLogGroupNode' : 'ExplorerServiceNode') : 'Command'
            await tailLogGroup(liveTailRegistry, source, liveTailCodeLensProvider, logGroupInfo)
        }),

        Commands.register('aws.cwl.stopTailingLogGroup', async (document: vscode.TextDocument, source: string) => {
            closeSession(document.uri, liveTailRegistry, source, liveTailCodeLensProvider)
        }),

        Commands.register('aws.cwl.clearDocument', async (document: vscode.TextDocument) => {
            await clearDocument(document)
        }),

        Commands.register('aws.appBuilder.searchLogs', async (node: DeployedResourceNode) => {
            try {
                const logGroupInfo = isTreeNode(node)
                    ? {
                          regionName: node.resource.regionCode,
                          groupName: getFunctionLogGroupName(node.resource.explorerNode.configuration),
                      }
                    : undefined
                const source: string = logGroupInfo ? 'AppBuilderSearchLogs' : 'CommandPaletteSearchLogs'
                await searchLogGroup(registry, source, logGroupInfo)
            } catch (err) {
                getLogger().error('Failed to search logs: %s', err)
                throw ToolkitError.chain(err, 'Failed to search logs')
            }
        })
    )
}

export function getFunctionLogGroupName(configuration: any) {
    const logGroupPrefix = '/aws/lambda/'
    return configuration.LoggingConfig?.LogGroup || logGroupPrefix + configuration.FunctionName
}
