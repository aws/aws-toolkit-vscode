/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    applyResultsToMetadata,
    createNewSamApplication,
    CreateNewSamApplicationResults,
    resumeCreateNewSamApp
} from '../../lambda/commands/createNewSamApp'
import { deploySamApplication, SamDeployWizardResponseProvider } from '../../lambda/commands/deploySamApplication'
import { SamParameterCompletionItemProvider } from '../../lambda/config/samParameterCompletionItemProvider'
import { configureLocalLambda } from '../../lambda/local/configureLocalLambda'
import {
    DefaultSamDeployWizardContext,
    SamDeployWizard,
    SamDeployWizardResponse
} from '../../lambda/wizards/samDeployWizard'
import { AwsContext } from '../awsContext'
import { CodeLensProviderParams } from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import * as tsLensProvider from '../codelens/typescriptCodeLensProvider'
import { RegionProvider } from '../regions/regionProvider'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { MetricDatum } from '../telemetry/clienttelemetry'
import { TelemetryService } from '../telemetry/telemetryService'
import { defaultMetricDatum, registerCommand } from '../telemetry/telemetryUtils'
import { PromiseSharer } from '../utilities/promiseUtilities'
import { ChannelLogger, getChannelLogger } from '../utilities/vsCodeUtils'
import { initialize as initializeSamCliContext } from './cli/samCliContext'
import { detectSamCli } from './cli/samCliDetection'

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

    initializeSamCliContext({
        settingsConfiguration: activateArguments.toolkitSettings
    })

    activateArguments.extensionContext.subscriptions.push(
        ...(await activateCodeLensProviders(
            activateArguments.toolkitSettings,
            activateArguments.outputChannel,
            activateArguments.telemetryService
        ))
    )

    await registerServerlessCommands({
        awsContext: activateArguments.awsContext,
        extensionContext: activateArguments.extensionContext,
        regionProvider: activateArguments.regionProvider,
        channelLogger
    })

    activateArguments.extensionContext.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            {
                language: 'json',
                scheme: 'file',
                pattern: '**/.aws/parameters.json'
            },
            new SamParameterCompletionItemProvider(),
            '"'
        )
    )

    await detectSamCli(false)

    await resumeCreateNewSamApp()
}

async function registerServerlessCommands(params: {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    regionProvider: RegionProvider
    channelLogger: ChannelLogger
}): Promise<void> {
    params.extensionContext.subscriptions.push(
        registerCommand({
            command: 'aws.samcli.detect',
            telemetryName: 'Command_aws.samcli.detect',
            callback: async () =>
                await PromiseSharer.getExistingPromiseOrCreate('samcli.detect', async () => await detectSamCli(true))
        })
    )

    params.extensionContext.subscriptions.push(
        registerCommand({
            command: 'aws.lambda.createNewSamApp',
            callback: async (): Promise<{ datum: MetricDatum }> => {
                const createNewSamApplicationResults: CreateNewSamApplicationResults = await createNewSamApplication(
                    params.channelLogger
                )
                const datum = defaultMetricDatum('new')
                datum.Metadata = []
                applyResultsToMetadata(createNewSamApplicationResults, datum.Metadata)

                return {
                    datum
                }
            },
            telemetryName: 'project_new'
        })
    )

    params.extensionContext.subscriptions.push(
        registerCommand({
            command: 'aws.deploySamApplication',
            callback: async () => {
                const samDeployWizardContext = new DefaultSamDeployWizardContext(params.regionProvider)
                const samDeployWizard: SamDeployWizardResponseProvider = {
                    getSamDeployWizardResponse: async (): Promise<SamDeployWizardResponse | undefined> => {
                        const wizard = new SamDeployWizard(samDeployWizardContext)

                        return wizard.run()
                    }
                }

                await deploySamApplication(
                    {
                        channelLogger: params.channelLogger,
                        samDeployWizard
                    },
                    {
                        awsContext: params.awsContext
                    }
                )
            },
            telemetryName: 'lambda_deploy'
        })
    )

    params.extensionContext.subscriptions.push(
        registerCommand({
            command: 'aws.configureLambda',
            callback: configureLocalLambda,
            telemetryName: 'lambda_configurelocal'
        })
    )

    // TODO : Register CodeLens commands from here instead of in xxxCodeLensProvider.ts::initialize
}

async function activateCodeLensProviders(
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService
): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = []
    const providerParams: CodeLensProviderParams = {
        configuration,
        outputChannel: toolkitOutputChannel,
        telemetryService
    }

    tsLensProvider.initialize(providerParams)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            // TODO : Turn into a constant to be consistent with Python, C#
            [
                {
                    language: 'javascript',
                    scheme: 'file'
                }
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
