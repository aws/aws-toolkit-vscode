/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import globals from '../extensionGlobals'

import * as vscode from 'vscode'
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
import { ExtContext } from '../extensions'
import { getIdeProperties, isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger/logger'
import { TelemetryService } from '../telemetry/telemetryService'
import { NoopWatcher } from '../fs/watchedFiles'
import { detectSamCli } from './cli/samCliDetection'
import { CodelensRootRegistry } from '../fs/codelensRootRegistry'
import { AWS_SAM_DEBUG_TYPE } from './debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider } from './debugger/awsSamDebugger'
import { addSamDebugConfiguration } from './debugger/commands/addSamDebugConfiguration'
import { lazyLoadSamTemplateStrings } from '../../lambda/models/samTemplates'
import { shared } from '../utilities/functionUtils'
import { migrateLegacySettings, SamCliSettings } from './cli/samCliSettings'
import { Commands } from '../vscode/commands2'
import { registerSync } from './sync'

const sharedDetectSamCli = shared(detectSamCli)

/**
 * Activate SAM-related functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    await migrateLegacySettings()
    const config = SamCliSettings.instance

    ctx.extensionContext.subscriptions.push(
        ...(await activateCodeLensProviders(ctx, config, ctx.outputChannel, ctx.telemetryService))
    )

    await registerServerlessCommands(ctx, config)

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

    config.onDidChange(event => {
        if (event.key === 'location') {
            // This only shows a message (passive=true), does not set anything.
            sharedDetectSamCli({ passive: true, showMessage: true })
        }
    })

    ctx.extensionContext.subscriptions.push(config)

    if (globals.didReload) {
        await resumeCreateNewSamApp(ctx)
    }

    registerSync()
}

async function registerServerlessCommands(ctx: ExtContext, settings: SamCliSettings): Promise<void> {
    lazyLoadSamTemplateStrings()
    ctx.extensionContext.subscriptions.push(
        Commands.register({ id: 'aws.samcli.detect', autoconnect: false }, () =>
            sharedDetectSamCli({ passive: false, showMessage: true })
        ),
        Commands.register({ id: 'aws.lambda.createNewSamApp', autoconnect: false }, async () => {
            await createNewSamApplication(ctx)
        }),
        Commands.register({ id: 'aws.addSamDebugConfiguration', autoconnect: false }, addSamDebugConfiguration),
        Commands.register(
            { id: 'aws.pickAddSamDebugConfiguration', autoconnect: false },
            codelensUtils.pickAddSamDebugConfiguration
        ),
        Commands.register({ id: 'aws.deploySamApplication', autoconnect: true }, async arg => {
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
                    settings,
                }
            )
        })
    )
}

async function activateCodeLensRegistry(context: ExtContext) {
    try {
        const registry = new CodelensRootRegistry()
        globals.codelensRootRegistry = registry

        //
        // "**/…" string patterns watch recursively across _all_ workspace
        // folders (see documentation for addWatchPattern()).
        //
        await registry.addWatchPattern(pyLensProvider.PYTHON_BASE_PATTERN)
        await registry.addWatchPattern(jsLensProvider.JAVASCRIPT_BASE_PATTERN)
        await registry.addWatchPattern(csLensProvider.CSHARP_BASE_PATTERN)
        await registry.addWatchPattern(goLensProvider.GO_BASE_PATTERN)
        await registry.addWatchPattern(javaLensProvider.GRADLE_BASE_PATTERN)
        await registry.addWatchPattern(javaLensProvider.MAVEN_BASE_PATTERN)
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
        globals.codelensRootRegistry = new NoopWatcher() as unknown as CodelensRootRegistry
    }
    context.extensionContext.subscriptions.push(globals.codelensRootRegistry)
}

async function activateCodeLensProviders(
    context: ExtContext,
    configuration: SamCliSettings,
    toolkitOutputChannel: vscode.OutputChannel,
    telemetryService: TelemetryService
): Promise<vscode.Disposable[]> {
    const disposables: vscode.Disposable[] = []
    const tsCodeLensProvider = codelensUtils.makeTypescriptCodeLensProvider(configuration)
    const pyCodeLensProvider = await codelensUtils.makePythonCodeLensProvider(configuration)
    const javaCodeLensProvider = await codelensUtils.makeJavaCodeLensProvider(configuration)
    const csCodeLensProvider = await codelensUtils.makeCSharpCodeLensProvider(configuration)
    const goCodeLensProvider = await codelensUtils.makeGoCodeLensProvider(configuration)

    // Ideally we should not need to `await` this Promise, but CodeLens providers are currently not implementing
    // the event to notify on when their results change.
    await activateCodeLensRegistry(context)

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

    disposables.push(vscode.languages.registerCodeLensProvider(jsLensProvider.TYPESCRIPT_ALL_FILES, tsCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(pyLensProvider.PYTHON_ALLFILES, pyCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(javaLensProvider.JAVA_ALLFILES, javaCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(csLensProvider.CSHARP_ALLFILES, csCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(goLensProvider.GO_ALLFILES, goCodeLensProvider))

    disposables.push(
        Commands.register({ id: 'aws.toggleSamCodeLenses', autoconnect: false }, async () => {
            const toggled = !configuration.get('enableCodeLenses', false)
            configuration.update('enableCodeLenses', toggled)
        })
    )

    disposables.push(
        Commands.register('aws.addSamDebugConfig', async () => {
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

    return disposables
}
