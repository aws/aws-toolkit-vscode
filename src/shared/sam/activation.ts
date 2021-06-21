/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { createNewSamApplication, resumeCreateNewSamApp } from '../../lambda/commands/createNewSamApp'
import { deploySamApplication } from '../../lambda/commands/deploySamApplication'
import { SamParameterCompletionItemProvider } from '../../lambda/config/samParameterCompletionItemProvider'
import {
    DefaultSamDeployWizardContext,
    SamDeployWizard,
    SamDeployWizardResponse,
} from '../../lambda/wizards/samDeployWizard'
import * as codelensUtils from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as javaLensProvider from '../codelens/javaCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import * as goLensProvider from '../codelens/goCodeLensProvider'
import { SamTemplateCodeLensProvider } from '../codelens/samTemplateCodeLensProvider'
import * as jsLensProvider from '../codelens/typescriptCodeLensProvider'
import { ext } from '../extensionGlobals'
import { ExtContext, VSCODE_EXTENSION_ID } from '../extensions'
import { getIdeProperties, getIdeType, IDE, isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger/logger'
import { SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from '../telemetry/telemetryService'
import { PromiseSharer } from '../utilities/promiseUtilities'
import { NoopWatcher } from '../watchedFiles'
import { initialize as initializeSamCliContext } from './cli/samCliContext'
import { detectSamCli } from './cli/samCliDetection'
import { CodelensRootRegistry } from './codelensRootRegistry'
import { AWS_SAM_DEBUG_TYPE } from './debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider } from './debugger/awsSamDebugger'
import { addSamDebugConfiguration } from './debugger/commands/addSamDebugConfiguration'
import { lazyLoadSamTemplateStrings } from '../../lambda/models/samTemplates'
const localize = nls.loadMessageBundle()

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

    ctx.extensionContext.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('aws.samcli.location')) {
                // This only shows a message (passive=true), does not set anything.
                detectSamCli({ passive: true, showMessage: true })
            }
        })
    )

    if (ext.didReload()) {
        await resumeCreateNewSamApp(ctx)
    }
}

async function registerServerlessCommands(ctx: ExtContext): Promise<void> {
    lazyLoadSamTemplateStrings()
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
            await createNewSamApplication(ctx)
        }),
        vscode.commands.registerCommand('aws.addSamDebugConfiguration', addSamDebugConfiguration),
        vscode.commands.registerCommand('aws.pickAddSamDebugConfiguration', codelensUtils.pickAddSamDebugConfiguration),
        vscode.commands.registerCommand('aws.deploySamApplication', async arg => {
            // `arg` is one of :
            //  - undefined
            //  - regionNode (selected from AWS Explorer)
            //  -  Uri to template.yaml (selected from File Explorer)

            const samDeployWizardContext = new DefaultSamDeployWizardContext(ctx)
            const samDeployWizard = async (): Promise<SamDeployWizardResponse | undefined> => {
                const wizard = new SamDeployWizard(samDeployWizardContext, arg)
                return wizard.run()
            }

            await deploySamApplication(
                {
                    samDeployWizard: samDeployWizard,
                },
                {
                    awsContext: ctx.awsContext,
                    settings: ctx.settings,
                }
            )
        })
    )
}

async function activateCodeLensProviders(
    context: ExtContext,
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService
): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = []
    const tsCodeLensProvider = codelensUtils.makeTypescriptCodeLensProvider(configuration)
    const pyCodeLensProvider = await codelensUtils.makePythonCodeLensProvider(configuration)
    const javaCodeLensProvider = await codelensUtils.makeJavaCodeLensProvider(configuration)
    const csCodeLensProvider = await codelensUtils.makeCSharpCodeLensProvider(configuration)
    const goCodeLensProvider = await codelensUtils.makeGoCodeLensProvider(configuration)

    const supportedLanguages: {
        [language: string]: codelensUtils.OverridableCodeLensProvider
    } = {
        [jsLensProvider.JAVASCRIPT_LANGUAGE]: tsCodeLensProvider,
        [pyLensProvider.PYTHON_LANGUAGE]: pyCodeLensProvider,
    }

    if (!isCloud9()) {
        supportedLanguages[javaLensProvider.JAVA_LANGUAGE] = javaCodeLensProvider
        supportedLanguages[csLensProvider.CSHARP_LANGUAGE] = csCodeLensProvider
        supportedLanguages[goLensProvider.GO_LANGUAGE] = goCodeLensProvider
    }

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

    disposables.push(vscode.languages.registerCodeLensProvider(jsLensProvider.JAVASCRIPT_ALL_FILES, tsCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(pyLensProvider.PYTHON_ALLFILES, pyCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(javaLensProvider.JAVA_ALLFILES, javaCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(csLensProvider.CSHARP_ALLFILES, csCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(goLensProvider.GO_ALLFILES, goCodeLensProvider))

    disposables.push(
        vscode.commands.registerCommand('aws.toggleSamCodeLenses', () => {
            const toggled = !configuration.readSetting<boolean>(codelensUtils.STATE_NAME_ENABLE_CODELENSES)
            configuration.writeSetting(
                codelensUtils.STATE_NAME_ENABLE_CODELENSES,
                toggled,
                vscode.ConfigurationTarget.Global
            )
        })
    )

    disposables.push(
        vscode.commands.registerCommand('aws.addSamDebugConfig', async () => {
            const activeEditor = vscode.window.activeTextEditor
            if (!activeEditor) {
                getLogger().error(`aws.addSamDebugConfig was called without an active text editor`)
                vscode.window.showErrorMessage(
                    localize('AWS.pickDebugHandler.noEditor', 'Toolkit could not find an active editor')
                )

                return
            }
            const document = activeEditor.document
            const provider = supportedLanguages[document.languageId]
            if (!provider) {
                getLogger().error(
                    `aws.addSamDebugConfig called on a document with an invalid language: ${document.languageId}`
                )
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.pickDebugHandler.invalidLanguage',
                        'Toolkit cannot detect handlers in language: {0}',
                        document.languageId
                    )
                )

                return
            }

            const lenses =
                (await provider.provideCodeLenses(document, new vscode.CancellationTokenSource().token, true)) ?? []
            codelensUtils.invokeCodeLensCommandPalette(document, lenses)
        })
    )

    try {
        const registry = new CodelensRootRegistry()

        await registry.addWatchPattern(pyLensProvider.PYTHON_BASE_PATTERN)
        await registry.addWatchPattern(jsLensProvider.JAVASCRIPT_BASE_PATTERN)
        await registry.addWatchPattern(csLensProvider.CSHARP_BASE_PATTERN)
        await registry.addWatchPattern(goLensProvider.GO_BASE_PATTERN)
        await registry.addWatchPattern(javaLensProvider.GRADLE_BASE_PATTERN)
        await registry.addWatchPattern(javaLensProvider.MAVEN_BASE_PATTERN)

        ext.codelensRootRegistry = registry
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.codelens.failToInitializeCode',
                'Failed to activate Lambda handler {0}',
                getIdeProperties().codelenses
            )
        )
        getLogger().error('Failed to activate codelens registry', e)
        // This prevents us from breaking for any reason later if it fails to load. Since
        // Noop watcher is always empty, we will get back empty arrays with no issues.
        ext.codelensRootRegistry = (new NoopWatcher() as unknown) as CodelensRootRegistry
    }
    context.extensionContext.subscriptions.push(ext.codelensRootRegistry)

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

    // Show this only in VSCode since other VSCode-like IDEs (e.g. Theia) may
    // not have a marketplace or contain the YAML plugin.
    if (!neverPromptAgain && getIdeType() === IDE.vscode && !vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml)) {
        // Disposed immediately after showing one, so the user isn't prompted
        // more than once per session.
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
            localize('AWS.message.info.yaml.prompt', 'Install YAML extension for additional {0} features.', getIdeProperties().company),
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
