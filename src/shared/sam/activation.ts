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
import { deploySamApplication } from '../../lambda/commands/deploySamApplication'
import { SamParameterCompletionItemProvider } from '../../lambda/config/samParameterCompletionItemProvider'
import { AwsContext } from '../awsContext'
import { CodeLensProviderParams } from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import * as tsLensProvider from '../codelens/typescriptCodeLensProvider'
import { getLogger, Logger } from '../logger'
import { RegionProvider } from '../regions/regionProvider'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from '../telemetry/telemetryService'
import { Datum, TelemetryNamespace } from '../telemetry/telemetryTypes'
import { defaultMetricDatum, registerCommand } from '../telemetry/telemetryUtils'
import { PromiseSharer } from '../utilities/promiseUtilities'
import { getChannelLogger } from '../utilities/vsCodeUtils'
import { initialize as initializeSamCliContext } from './cli/samCliContext'
import { detectSamCli } from './cli/samCliDetection'

/**
 * Activate serverless related functionality for the extension.
 */
export async function activate(activateArguments: {
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    regionProvider: RegionProvider,
    toolkitSettings: SettingsConfiguration,
    outputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService,
}): Promise<void> {
    // TODO : CC : rearrange everything in this file
    const logger = getLogger()
    const channelLogger = getChannelLogger(activateArguments.outputChannel, logger)

    initializeSamCliContext({
        settingsConfiguration: activateArguments.toolkitSettings,
        logger
    })

    activateArguments.extensionContext.subscriptions.push(
        ...await activateCodeLensProviders(
            activateArguments.toolkitSettings,
            activateArguments.outputChannel,
            activateArguments.telemetryService)
    )

    // TODO : CC : handle command disposables
    registerCommand({
        command: 'aws.samcli.detect',
        callback: async () => await PromiseSharer.getExistingPromiseOrCreate(
            'samcli.detect',
            async () => await detectSamCli(true)
        )
    })

    registerCommand({
        command: 'aws.lambda.createNewSamApp',
        callback: async (): Promise<{ datum: Datum }> => {
            const createNewSamApplicationResults: CreateNewSamApplicationResults = await createNewSamApplication(
                channelLogger,
                activateArguments.extensionContext,
            )
            const datum = defaultMetricDatum('new')
            datum.metadata = new Map()
            applyResultsToMetadata(createNewSamApplicationResults, datum.metadata)

            return {
                datum
            }
        },
        telemetryName: {
            namespace: TelemetryNamespace.Project,
            name: 'new'
        }
    })

    registerCommand({
        command: 'aws.deploySamApplication',
        callback: async () => await deploySamApplication(
            {
                channelLogger,
                regionProvider: activateArguments.regionProvider,
                extensionContext: activateArguments.extensionContext
            },
            {
                awsContext: activateArguments.awsContext
            }
        ),
        telemetryName: {
            namespace: TelemetryNamespace.Lambda,
            name: 'deploy'
        }
    })

    vscode.languages.registerCompletionItemProvider(
        {
            language: 'json',
            scheme: 'file',
            pattern: '**/.aws/parameters.json'
        },
        new SamParameterCompletionItemProvider(),
        '"'
    )

    await detectSamCli(false)

    await resumeCreateNewSamApp()
}

async function activateCodeLensProviders(
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService,
): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = []
    const providerParams: CodeLensProviderParams = {
        configuration,
        outputChannel: toolkitOutputChannel,
        telemetryService,
    }

    tsLensProvider.initialize(providerParams)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
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
    disposables.push(vscode.languages.registerCodeLensProvider(
        pyLensProvider.PYTHON_ALLFILES,
        await pyLensProvider.makePythonCodeLensProvider(new DefaultSettingsConfiguration('python'))
    ))

    await csLensProvider.initialize(providerParams)
    disposables.push(vscode.languages.registerCodeLensProvider(
        csLensProvider.CSHARP_ALLFILES,
        await csLensProvider.makeCSharpCodeLensProvider()
    ))

    return disposables
}
