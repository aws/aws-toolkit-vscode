/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window, languages } from 'vscode'
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    ErrorHandlerResult,
    CloseHandlerResult,
} from 'vscode-languageclient/node'
import { CloseAction, ErrorAction, Message } from 'vscode-languageclient/node'
import { formatMessage, toString } from './utils'
import { restartCommand } from './commands/lspCommands'
import globals from '../../shared/extensionGlobals'
import { getServiceEnvVarConfig } from '../../shared/vscode/env'
import { DevSettings } from '../../shared/settings'
import {
    deployTemplateCommand,
    validateDeploymentCommand,
    rerunLastValidationCommand,
    importResourceStateCommand,
    cloneResourceStateCommand,
    selectResourceTypesCommand,
    addResourceTypesCommand,
    refreshAllResourcesCommand,
    refreshResourceListCommand,
    copyResourceIdentifierCommand,
    viewStackDiffCommand,
    viewStackDetailCommand,
    focusDiffCommand,
    getStackManagementInfoCommand,
    extractToParameterPositionCursorCommand,
    loadMoreResourcesCommand,
    loadMoreStacksCommand,
    searchResourceCommand,
    executeChangeSetCommand,
    addRelatedResourcesCommand,
    refreshChangeSetsCommand,
    loadMoreChangeSetsCommand,
    showStackOverviewCommand,
    createProjectCommand,
    addEnvironmentCommand,
    removeEnvironmentCommand,
    deleteChangeSetCommand,
    showStackEventsCommand,
    showStackOutputsCommand,
    viewChangeSetCommand,
    deployTemplateFromStacksMenuCommand,
} from './commands/cfnCommands'
import { openStackTemplateCommand } from './commands/openStackTemplate'
import { selectRegionCommand } from './commands/regionCommands'
import { AwsCredentialsService, encryptionKey } from './auth/credentials'
import { ExtensionId, ExtensionName, Version, CloudFormationTelemetrySettings } from './extensionConfig'
import { commandKey } from './utils'
import { CloudFormationExplorer } from './explorer/explorer'
import { promptTelemetryOptIn } from './telemetryOptIn'

import { refreshCommand, StacksManager } from './stacks/stacksManager'
import { StackOverviewWebviewProvider } from './ui/stackOverviewWebviewProvider'
import { StackEventsWebviewProvider } from './ui/stackEventsWebviewProvider'
import { StackOutputsWebviewProvider } from './ui/stackOutputsWebviewProvider'
import { DiffWebviewProvider } from './ui/diffWebviewProvider'
import { StackResourcesWebviewProvider } from './ui/stackResourcesWebviewProvider'
import { DocumentManager } from './documents/documentManager'

import { ResourcesManager } from './resources/resourcesManager'
import { ResourceSelector } from './ui/resourceSelector'
import { RelatedResourcesManager } from './relatedResources/relatedResourcesManager'
import { RelatedResourceSelector } from './ui/relatedResourceSelector'

import { StackActionCodeLensProvider } from './codelens/stackActionCodeLensProvider'
import { getClientId } from '../../shared/telemetry/util'
import { SettingsLspServerProvider } from './lsp-server/settingsLspServerProvider'
import { DevLspServerProvider } from './lsp-server/devLspServerProvider'
import { RemoteLspServerProvider } from './lsp-server/remoteLspServerProvider'
import { LspServerProvider } from './lsp-server/lspServerProvider'
import { getLogger } from '../../shared/logger/logger'
import { ChangeSetsManager } from './stacks/changeSetsManager'
import { CfnEnvironmentManager } from './cfn-init/cfnEnvironmentManager'
import { CfnEnvironmentSelector } from './ui/cfnEnvironmentSelector'
import { selectEnvironmentCommand } from './commands/environmentCommands'
import { CfnInitUiInterface } from './cfn-init/cfnInitUiInterface'
import { CfnInitCliCaller } from './cfn-init/cfnInitCliCaller'
import { CfnEnvironmentFileSelector } from './ui/cfnEnvironmentFileSelector'

let client: LanguageClient

export async function activate(context: ExtensionContext) {
    const cfnTelemetrySettings = new CloudFormationTelemetrySettings()
    const telemetryEnabled = await promptTelemetryOptIn(context, cfnTelemetrySettings)

    const cfnLspConfig = {
        ...DevSettings.instance.getServiceConfig('cloudformationLsp', {}),
        ...getServiceEnvVarConfig('cloudformationLsp', ['path', 'cloudformationEndpoint']),
    }

    const serverProvider = new LspServerProvider([
        new DevLspServerProvider(context),
        new SettingsLspServerProvider(cfnLspConfig),
        new RemoteLspServerProvider(),
    ])
    const serverFile = await serverProvider.serverExecutable()
    getLogger().info(`Found CloudFormation LSP executable: ${serverFile}`)
    const serverRootDir = await serverProvider.serverRootDir()

    const envOptions = {
        NODE_OPTIONS: '--enable-source-maps',
    }

    const serverOptions: ServerOptions = {
        run: {
            module: serverFile,
            transport: TransportKind.ipc,
            options: {
                env: envOptions,
            },
        },
        debug: {
            module: serverFile,
            transport: TransportKind.ipc,
            options: {
                execArgv: ['--no-lazy'],
                env: envOptions,
            },
        },
    }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'plaintext' },
            { scheme: 'file', language: 'cloudformation' },
            { scheme: 'file', language: 'template' },
            { scheme: 'file', language: 'json' },
            { scheme: 'file', language: 'yaml' },
            { scheme: 'file', pattern: '**/*.txt' },
            { scheme: 'file', pattern: '**/*.template' },
            { scheme: 'file', pattern: '**/*.cfn' },
            { scheme: 'file', pattern: '**/*.json' },
            { scheme: 'file', pattern: '**/*.yaml' },
        ],
        initializationOptions: {
            handledSchemaProtocols: ['file'],
            aws: {
                clientInfo: {
                    extension: {
                        name: ExtensionId,
                        version: Version,
                    },
                    clientId: getClientId(globals.globalState, telemetryEnabled),
                },
                telemetryEnabled: telemetryEnabled,
                ...(cfnLspConfig.cloudformationEndpoint && {
                    cloudformation: {
                        endpoint: cfnLspConfig.cloudformationEndpoint,
                    },
                }),
                encryption: {
                    key: encryptionKey.toString('base64'),
                    mode: 'JWT',
                },
            },
        },
        errorHandler: {
            error: (error: Error, message: Message | undefined, count: number | undefined): ErrorHandlerResult => {
                void window.showErrorMessage(formatMessage(`Error count = ${count}): ${toString(message)}`))
                return { action: ErrorAction.Continue }
            },
            closed: (): CloseHandlerResult => {
                void window.showWarningMessage(formatMessage(`Server connection closed`))
                return { action: CloseAction.DoNotRestart }
            },
        },
    }

    client = new LanguageClient(ExtensionId, ExtensionName, serverOptions, clientOptions)

    const stacksManager = new StacksManager(client)

    client
        .start()
        .then(() => {
            const documentManager = new DocumentManager(client)

            const resourceSelector = new ResourceSelector(client)
            const resourcesManager = new ResourcesManager(client, resourceSelector)
            const relatedResourceSelector = new RelatedResourceSelector(client)
            const relatedResourcesManager = new RelatedResourcesManager(
                client,
                relatedResourceSelector,
                resourceSelector,
                resourcesManager.importResourceStates.bind(resourcesManager)
            )
            const changeSetManager = new ChangeSetsManager(client)
            const environmentSelector = new CfnEnvironmentSelector()
            const environmentFileSelector = new CfnEnvironmentFileSelector()
            const environmentManager = new CfnEnvironmentManager(client, environmentSelector, environmentFileSelector)

            const cfnInitCliCaller = new CfnInitCliCaller(serverRootDir)
            const cfnInitUiInterface = new CfnInitUiInterface(cfnInitCliCaller)

            const cfnExplorer = new CloudFormationExplorer(
                stacksManager,
                resourcesManager,
                changeSetManager,
                documentManager,
                globals.regionProvider,
                environmentManager
            )

            // Add listener to refresh explorer when resources change
            resourcesManager.addListener(() => {
                cfnExplorer.refresh()
            })

            stacksManager.addListener(() => {
                cfnExplorer.refresh()
            })

            documentManager.addListener(() => {
                cfnExplorer.refresh()
            })

            environmentManager.addListener(() => {
                cfnExplorer.refresh()
            })

            const credentialsService = new AwsCredentialsService(
                stacksManager,
                resourcesManager,
                cfnExplorer.regionManager
            )
            cfnExplorer.setCredentialsService(credentialsService)

            // Create diff webview provider
            const diffProvider = new DiffWebviewProvider()

            const resourcesProvider = new StackResourcesWebviewProvider(client)

            // Create stack overview webview provider
            const overviewProvider = new StackOverviewWebviewProvider()

            // Create stack events webview provider
            const eventsProvider = new StackEventsWebviewProvider(client)

            // Create stack outputs webview provider
            const outputsProvider = new StackOutputsWebviewProvider(client)

            const documentSelector = [
                { scheme: 'file', language: 'cloudformation' },
                { scheme: 'file', language: 'yaml' },
                { scheme: 'file', language: 'json' },
            ]

            const codeLensProvider = languages.registerCodeLensProvider(
                documentSelector,
                new StackActionCodeLensProvider(client)
            )

            context.subscriptions.push(
                { dispose: () => client?.stop() },
                codeLensProvider,
                stacksManager,
                window.createTreeView('aws.cloudformation', {
                    treeDataProvider: cfnExplorer,
                    showCollapseAll: true,
                    canSelectMany: true,
                }),
                loadMoreResourcesCommand(cfnExplorer),
                loadMoreStacksCommand(cfnExplorer),
                searchResourceCommand(cfnExplorer, resourcesManager),
                refreshChangeSetsCommand(cfnExplorer),
                loadMoreChangeSetsCommand(cfnExplorer),
                showStackOverviewCommand(overviewProvider),
                showStackEventsCommand(eventsProvider),
                showStackOutputsCommand(outputsProvider),
                addResourceTypesCommand(resourcesManager),
                refreshAllResourcesCommand(resourcesManager),
                refreshResourceListCommand(resourcesManager, cfnExplorer),
                copyResourceIdentifierCommand(),
                selectResourceTypesCommand(resourcesManager),
                importResourceStateCommand(resourcesManager),
                cloneResourceStateCommand(resourcesManager),
                getStackManagementInfoCommand(resourcesManager),
                window.registerWebviewViewProvider(commandKey('diff'), diffProvider),
                window.registerWebviewViewProvider(commandKey('stack.events'), eventsProvider),
                window.registerWebviewViewProvider(commandKey('detail'), resourcesProvider),
                window.registerWebviewViewProvider(commandKey('stack.outputs'), outputsProvider),
                viewStackDiffCommand(),
                viewStackDetailCommand(resourcesProvider),
                focusDiffCommand(),
                restartCommand(client),
                validateDeploymentCommand(client, diffProvider, documentManager, environmentManager),
                deployTemplateCommand(client, diffProvider, documentManager, environmentManager),
                deployTemplateFromStacksMenuCommand(),
                executeChangeSetCommand(client),
                deleteChangeSetCommand(client),
                viewChangeSetCommand(client, diffProvider),
                refreshCommand(stacksManager),
                openStackTemplateCommand(client),
                selectRegionCommand(cfnExplorer),
                selectEnvironmentCommand(cfnExplorer),
                rerunLastValidationCommand(),
                extractToParameterPositionCursorCommand(),
                createProjectCommand(cfnInitUiInterface),
                addEnvironmentCommand(cfnInitUiInterface, cfnInitCliCaller, environmentManager),
                removeEnvironmentCommand(cfnInitCliCaller, environmentManager),
                addRelatedResourcesCommand(relatedResourcesManager),
                credentialsService,
                serverProvider
            )

            return credentialsService.initialize(client)
        })
        .catch((err: any) => {
            void window.showErrorMessage(
                formatMessage(`Failed to start ${err instanceof Error ? err.message : toString(err)}`)
            )
        })
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined
    }

    return client.stop()
}
