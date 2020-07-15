/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createNewSamApplication, resumeCreateNewSamApp } from '../../lambda/commands/createNewSamApp'
import { deploySamApplication, SamDeployWizardResponseProvider } from '../../lambda/commands/deploySamApplication'
import { SamParameterCompletionItemProvider } from '../../lambda/config/samParameterCompletionItemProvider'
import { configureLocalLambda } from '../../lambda/local/configureLocalLambda'
import {
    DefaultSamDeployWizardContext,
    SamDeployWizard,
    SamDeployWizardResponse,
} from '../../lambda/wizards/samDeployWizard'
import { AwsContext } from '../awsContext'
import { CodeLensProviderParams } from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import * as tsLensProvider from '../codelens/typescriptCodeLensProvider'
import { RegionProvider } from '../regions/regionProvider'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from '../telemetry/telemetryService'
import { PromiseSharer } from '../utilities/promiseUtilities'
import { ChannelLogger, getChannelLogger } from '../utilities/vsCodeUtils'
import { initialize as initializeSamCliContext } from './cli/samCliContext'
import { detectSamCli } from './cli/samCliDetection'
import { AWS_SAM_DEBUG_TYPE, AwsSamDebugConfigurationProvider } from './debugger/awsSamDebugger'

/**
 * Activate serverless related functionality for the extension.
 */
export async function activate(activateArguments: {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    regionProvider: RegionProvider
    toolkitSettings: SettingsConfiguration
    outputChannel: vscode.OutputChannel
    telemetryService: TelemetryService
}): Promise<void> {
    const channelLogger = getChannelLogger(activateArguments.outputChannel)

    initializeSamCliContext({ settingsConfiguration: activateArguments.toolkitSettings })

    activateArguments.extensionContext.subscriptions.push(
        ...(await activateCodeLensProviders(
            activateArguments.extensionContext,
            activateArguments.toolkitSettings,
            activateArguments.outputChannel,
            activateArguments.telemetryService
        ))
    )

    await registerServerlessCommands({
        awsContext: activateArguments.awsContext,
        extensionContext: activateArguments.extensionContext,
        regionProvider: activateArguments.regionProvider,
        channelLogger,
    })

    const provider = vscode.debug.registerDebugConfigurationProvider(
        AWS_SAM_DEBUG_TYPE,
        new AwsSamDebugConfigurationProvider()
    )

    activateArguments.extensionContext.subscriptions.push(provider)

    activateArguments.extensionContext.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            {
                language: 'json',
                scheme: 'file',
                pattern: '**/.aws/parameters.json',
            },
            new SamParameterCompletionItemProvider(),
            '"'
        )
    )

    await detectSamCli({ showMessage: false })
    activateArguments.extensionContext.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('aws.samcli.location')) {
                detectSamCli({ showMessage: undefined })
            }
        })
    )

    await resumeCreateNewSamApp()
}

async function registerServerlessCommands(params: {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    regionProvider: RegionProvider
    channelLogger: ChannelLogger
}): Promise<void> {
    params.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.samcli.detect',
            async () =>
                await PromiseSharer.getExistingPromiseOrCreate(
                    'samcli.detect',
                    async () => await detectSamCli({ showMessage: true })
                )
        ),
        vscode.commands.registerCommand('aws.lambda.createNewSamApp', async () => {
            await createNewSamApplication(params.channelLogger, params.awsContext, params.regionProvider)
        }),
        vscode.commands.registerCommand('aws.configureLambda', configureLocalLambda),
        vscode.commands.registerCommand('aws.deploySamApplication', async () => {
            const samDeployWizardContext = new DefaultSamDeployWizardContext(params.regionProvider, params.awsContext)
            const samDeployWizard: SamDeployWizardResponseProvider = {
                getSamDeployWizardResponse: async (): Promise<SamDeployWizardResponse | undefined> => {
                    const wizard = new SamDeployWizard(samDeployWizardContext)

                    return wizard.run()
                },
            }

            await deploySamApplication(
                { channelLogger: params.channelLogger, samDeployWizard },
                { awsContext: params.awsContext }
            )
        })
    )

    // TODO : Register CodeLens commands from here instead of in xxxCodeLensProvider.ts::initialize
}

async function activateCodeLensProviders(
    context: vscode.ExtensionContext,
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService
): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = []
    const providerParams: CodeLensProviderParams = {
        context,
        configuration,
        outputChannel: toolkitOutputChannel,
        telemetryService,
    }

    tsLensProvider.initialize(providerParams)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            // TODO : Turn into a constant to be consistent with Python, C#
            [
                {
                    language: 'javascript',
                    scheme: 'file',
                },
            ],
            tsLensProvider.makeTypescriptCodeLensProvider()
        )
    )

    await pyLensProvider.initialize(providerParams)
    disposables.push(
        vscode.languages.registerCodeLensProvider(
            pyLensProvider.PYTHON_ALLFILES,
            await pyLensProvider.makePythonCodeLensProvider(new DefaultSettingsConfiguration('python'))
        )
    )

    await csLensProvider.initialize(providerParams)
    disposables.push(
        vscode.languages.registerCodeLensProvider(
            csLensProvider.CSHARP_ALLFILES,
            await csLensProvider.makeCSharpCodeLensProvider()
        )
    )

    return disposables
}
