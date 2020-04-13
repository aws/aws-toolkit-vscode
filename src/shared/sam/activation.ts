/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createNewSamApplication, resumeCreateNewSamApp } from '../../lambda/commands/createNewSamApp'
import { deploySamApplication, SamDeployWizardResponseProvider } from '../../lambda/commands/deploySamApplication'
import { SamParameterCompletionItemProvider } from '../../lambda/config/samParameterCompletionItemProvider'
import { configureLocalLambda } from '../../lambda/local/configureLocalLambda'
import { AWS_SAM_DEBUG_TYPE } from '../../lambda/local/debugConfiguration'
import {
    DefaultSamDeployWizardContext,
    SamDeployWizard,
    SamDeployWizardResponse,
} from '../../lambda/wizards/samDeployWizard'
import * as codelensUtils from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import { SamTemplateCodeLensProvider } from '../codelens/samTemplateCodeLensProvider'
import { ExtContext } from '../extensions'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from '../telemetry/telemetryService'
import { PromiseSharer } from '../utilities/promiseUtilities'
import { initialize as initializeSamCliContext } from './cli/samCliContext'
import { detectSamCli } from './cli/samCliDetection'
import { SamDebugConfigProvider } from './debugger/awsSamDebugger'
import { addSamDebugConfiguration } from './debugger/commands/addSamDebugConfiguration'
import { SamDebugSession } from './debugger/samDebugSession'

/**
 * Activate SAM-related functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    initializeSamCliContext({ settingsConfiguration: ctx.settings })

    ctx.subscriptions.push(
        ...(await activateCodeLensProviders(ctx, ctx.settings, ctx.outputChannel, ctx.telemetryService))
    )

    await registerServerlessCommands(ctx)

    ctx.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(AWS_SAM_DEBUG_TYPE, new SamDebugConfigProvider(ctx))
    )

    // "Inline" DA type: runs inside the extension and directly talks to it.
    //
    // Debug adapters can be run in different ways, defined by the type of
    // `vscode.DebugAdapterDescriptorFactory` you implement:
    // https://code.visualstudio.com/api/extension-guides/debugger-extension#alternative-approach-to-develop-a-debugger-extension
    //
    // XXX: requires the "debuggers.*.label" attribute in package.json!
    ctx.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(AWS_SAM_DEBUG_TYPE, new InlineDebugAdapterFactory(ctx))
    )

    ctx.subscriptions.push(
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

    await detectSamCli(false)

    await resumeCreateNewSamApp()
}

async function registerServerlessCommands(ctx: ExtContext): Promise<void> {
    ctx.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.samcli.detect',
            async () =>
                await PromiseSharer.getExistingPromiseOrCreate('samcli.detect', async () => await detectSamCli(true))
        ),
        vscode.commands.registerCommand('aws.lambda.getLambdaName', async () => {
            return 'foo'
            // try {
            //     await ext.awsContextCommands.onCommandShowRegion()
            // } finally {
            //     recordAwsShowRegion()
            //     recordVscodeActiveRegions({ value: awsExplorer.getRegionNodesSize() })
            // }
        }),
        vscode.commands.registerCommand('aws.lambda.createNewSamApp', async () => {
            await createNewSamApplication(ctx.chanLogger, ctx.awsContext, ctx.regionProvider)
        }),
        vscode.commands.registerCommand('aws.configureLambda', configureLocalLambda),
        vscode.commands.registerCommand('aws.addSamDebugConfiguration', addSamDebugConfiguration),
        vscode.commands.registerCommand('aws.deploySamApplication', async () => {
            const samDeployWizardContext = new DefaultSamDeployWizardContext(ctx.regionProvider, ctx.awsContext)
            const samDeployWizard: SamDeployWizardResponseProvider = {
                getSamDeployWizardResponse: async (): Promise<SamDeployWizardResponse | undefined> => {
                    const wizard = new SamDeployWizard(samDeployWizardContext)

                    return wizard.run()
                },
            }

            await deploySamApplication(
                { channelLogger: ctx.chanLogger, samDeployWizard },
                { awsContext: ctx.awsContext }
            )
        })
    )

    // TODO : Register CodeLens commands from here instead of in xxxCodeLensProvider.ts::initialize
}

async function activateCodeLensProviders(
    context: ExtContext,
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService
): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = []

    codelensUtils.initializeTypescriptCodelens(context)

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            [
                {
                    language: 'yaml',
                    scheme: 'file',
                    pattern: '**/*template.{yml,yaml}',
                },
            ],
            new SamTemplateCodeLensProvider()
        )
    )

    disposables.push(
        vscode.languages.registerCodeLensProvider(
            // TODO : Turn into a constant to be consistent with Python, C#
            [
                {
                    language: 'javascript',
                    scheme: 'file',
                },
            ],
            codelensUtils.makeTypescriptCodeLensProvider()
        )
    )

    await codelensUtils.initializePythonCodelens(context)
    disposables.push(
        vscode.languages.registerCodeLensProvider(
            pyLensProvider.PYTHON_ALLFILES,
            await codelensUtils.makePythonCodeLensProvider(new DefaultSettingsConfiguration('python'))
        )
    )

    await codelensUtils.initializeCsharpCodelens(context)
    disposables.push(
        vscode.languages.registerCodeLensProvider(
            csLensProvider.CSHARP_ALLFILES,
            await codelensUtils.makeCSharpCodeLensProvider()
        )
    )

    return disposables
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    public constructor(readonly ctx: ExtContext) {}

    /**
     * The inline implementation implements the Debug Adapter Protocol.
     * VSCode's extension API has a minimalistic subset of that protocol:
     *   - vscode.DebugAdapter.handleMessage(): for passing a DAP message to the adapter.
     *   - vscode.DebugAdapter.onDidSendMessage(): for listening for DAP messages received from the adapter.
     *
     * - Alternative: import the "vscode-debugprotocol" node module.
     * - Alternative (easier): use VSCode's default implementation of a debug
     *   adapter, available as node module "vscode-debugadapter" in 1.38+ the
     *   DebugSession (or LoggingDebugSession) is compatible with the
     *   `vscode.DebugAdapter` interface defined in the extension API.
     *
     * https://code.visualstudio.com/updates/v1_42#_extension-authoring
     */
    public createDebugAdapterDescriptor(
        _session: vscode.DebugSession
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterInlineImplementation(new SamDebugSession(this.ctx))
    }
}
