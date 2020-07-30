/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

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
import * as codelensUtils from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import { SamTemplateCodeLensProvider } from '../codelens/samTemplateCodeLensProvider'
import { ext } from '../extensionGlobals'
import { ExtContext, VSCODE_EXTENSION_ID } from '../extensions'
import { getIdeType, IDE } from '../extensionUtilities'
import { getLogger } from '../logger/logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from '../telemetry/telemetryService'
import { PromiseSharer } from '../utilities/promiseUtilities'
import { initialize as initializeSamCliContext } from './cli/samCliContext'
import { detectSamCli } from './cli/samCliDetection'
import { SamDebugConfigProvider } from './debugger/awsSamDebugger'
import { addSamDebugConfiguration } from './debugger/commands/addSamDebugConfiguration'
import { AWS_SAM_DEBUG_TYPE } from './debugger/awsSamDebugConfiguration'

const STATE_NAME_SUPPRESS_YAML_PROMPT = 'aws.sam.suppressYamlPrompt'

/**
 * Activate SAM-related functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    initializeSamCliContext({ settingsConfiguration: ctx.settings })

    createYamlExtensionPrompt()

    ctx.extensionContext.subscriptions.push(
        ...(await activateCodeLensProviders(ctx, ctx.settings, ctx.outputChannel, ctx.telemetryService))
    )

    await registerServerlessCommands(ctx)

    ctx.extensionContext.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(AWS_SAM_DEBUG_TYPE, new SamDebugConfigProvider(ctx))
    )

    ctx.extensionContext.subscriptions.push(
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

    await detectSamCli({ passive: true, showMessage: false })
    ctx.extensionContext.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('aws.samcli.location')) {
                detectSamCli({ passive: true, showMessage: undefined })
            }
        })
    )

    await resumeCreateNewSamApp()
}

async function registerServerlessCommands(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.samcli.detect',
            async () =>
                await PromiseSharer.getExistingPromiseOrCreate(
                    'samcli.detect',
                    async () => await detectSamCli({ passive: false, showMessage: true })
                )
        ),
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
            await codelensUtils.makePythonCodeLensProvider()
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

/**
 * Creates a prompt (via toast) to guide users to installing the Red Hat YAML extension.
 * This is necessary for displaying codelenses on templaye YAML files.
 * Will show once per extension activation at most (all prompting triggers are disposed of on first trigger)
 * Will not show if the YAML extension is installed or if a user has permanently dismissed the message.
 */
function createYamlExtensionPrompt(): void {
    const neverPromptAgain = ext.context.globalState.get<boolean>(STATE_NAME_SUPPRESS_YAML_PROMPT)

    // only pop this up in VS Code and Insiders since other VS Code-like IDEs (e.g. Theia) may not have a marketplace or contain the YAML plugin
    if (!neverPromptAgain && getIdeType() === IDE.vscode && !vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml)) {
        // these will all be disposed immediately after showing one so the user isn't prompted more than once per session
        const yamlPromptDisposables: vscode.Disposable[] = []

        // user opens a template file
        vscode.workspace.onDidOpenTextDocument(
            async (doc: vscode.TextDocument) => {
                promptInstallYamlPlugin(doc.fileName, yamlPromptDisposables)
            },
            undefined,
            yamlPromptDisposables
        )

        // user swaps to an already-open template file that didn't have focus
        vscode.window.onDidChangeActiveTextEditor(
            async (editor: vscode.TextEditor | undefined) => {
                await promptInstallYamlPluginFromEditor(editor, yamlPromptDisposables)
            },
            undefined,
            yamlPromptDisposables
        )

        // user already has an open template with focus
        // prescreen if a template.yaml is current open so we only call once
        const openTemplateYamls = vscode.window.visibleTextEditors.filter(editor => {
            const fileName = editor.document.fileName
            return fileName.endsWith('template.yaml') || fileName.endsWith('template.yml')
        })

        if (openTemplateYamls.length > 0) {
            promptInstallYamlPluginFromEditor(openTemplateYamls[0], yamlPromptDisposables)
        }
    }
}

async function promptInstallYamlPluginFromEditor(
    editor: vscode.TextEditor | undefined,
    disposables: vscode.Disposable[]
): Promise<void> {
    if (editor) {
        promptInstallYamlPlugin(editor.document.fileName, disposables)
    }
}

/**
 * Looks for template.yaml and template.yml files and disp[oses prompts
 * @param fileName File name to check against
 * @param disposables List of disposables to dispose of when the filename is a template YAML file
 */
async function promptInstallYamlPlugin(fileName: string, disposables: vscode.Disposable[]): Promise<void> {
    if (fileName.endsWith('template.yaml') || fileName.endsWith('template.yml')) {
        // immediately dispose other triggers so it doesn't flash again
        for (const prompt of disposables) {
            prompt.dispose()
        }

        const goToMarketplace = localize('AWS.message.info.yaml.goToMarketplace', 'Open Marketplace Page')
        const dismiss = localize('AWS.generic.response.dismiss', 'Dismiss')
        const permanentlySuppress = localize('AWS.message.info.yaml.suppressPrompt', "Dismiss, and don't show again")

        const response = await vscode.window.showInformationMessage(
            localize('AWS.message.info.yaml.prompt', 'Install YAML extension for additional AWS features.'),
            goToMarketplace,
            dismiss,
            permanentlySuppress
        )

        switch (response) {
            case goToMarketplace:
                // Available options are:
                // extension.open: opens extension page in VS Code extension marketplace view
                // workspace.extension.installPlugin: autoinstalls plugin with no additional feedback
                // workspace.extension.search: preloads and executes a search in the extension sidebar with the given term

                // not sure if these are 100% stable.
                // Opting for `extension.open` as this gives the user a good path forward to install while not doing anything potentially unexpected.
                try {
                    await vscode.commands.executeCommand('extension.open', VSCODE_EXTENSION_ID.yaml)
                } catch (e) {
                    const err = e as Error
                    getLogger().error(`Extension ${VSCODE_EXTENSION_ID.yaml} could not be opened: `, err.message)
                }
                break
            case permanentlySuppress:
                ext.context.globalState.update(STATE_NAME_SUPPRESS_YAML_PROMPT, true)
        }
    }
}
