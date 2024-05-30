/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import * as vscode from 'vscode'
import { DefaultSchemaClient, SchemaClient } from '../../../src/shared/clients/schemaClient'
import { createSchemaCodeDownloaderObject } from '../..//eventSchemas/commands/downloadSchemaItemCode'
import {
    SchemaCodeDownloader,
    SchemaCodeDownloadRequestDetails,
} from '../../eventSchemas/commands/downloadSchemaItemCode'
import { getApiValueForSchemasDownload } from '../../eventSchemas/models/schemaCodeLangs'
import {
    buildSchemaTemplateParameters,
    SchemaTemplateParameters,
} from '../../eventSchemas/templates/schemasAppTemplateUtils'
import { ActivationReloadState, SamInitState } from '../../shared/activationReloadState'
import { AwsContext } from '../../shared/awsContext'

import { fileExists, isInDirectory, readFileAsString } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getSamCliVersion, getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { SamCliValidator } from '../../shared/sam/cli/samCliValidator'
import { addFolderToWorkspace, tryGetAbsolutePath } from '../../shared/utilities/workspaceUtils'
import { goRuntimes } from '../models/samLambdaRuntime'
import { eventBridgeStarterAppTemplate } from '../models/samTemplates'
import { CreateNewSamAppWizard, CreateNewSamAppWizardForm } from '../wizards/samInitWizard'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'
import { SamDebugConfigProvider } from '../../shared/sam/debugger/awsSamDebugger'
import { ExtContext } from '../../shared/extensions'
import { isTemplateTargetProperties } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { TemplateTargetProperties } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { openLaunchJsonFile } from '../../shared/sam/debugger/commands/addSamDebugConfiguration'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { debugNewSamAppUrl, launchConfigDocUrl } from '../../shared/constants'
import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'
import { execFileSync } from 'child_process'
import { writeFile } from 'fs-extra'
import { checklogs } from '../../shared/localizedText'
import globals from '../../shared/extensionGlobals'
import { telemetry } from '../../shared/telemetry/telemetry'
import { LambdaArchitecture, Result, Runtime } from '../../shared/telemetry/telemetry'
import { getTelemetryReason, getTelemetryResult } from '../../shared/errors'
import { openUrl, replaceVscodeVars } from '../../shared/utilities/vsCodeUtils'

export const samInitTemplateFiles: string[] = ['template.yaml', 'template.yml']
export const samInitReadmeFile: string = 'README.TOOLKIT.md'
export const samInitReadmeSource: string = 'resources/markdown/samReadme.md'

export async function resumeCreateNewSamApp(
    extContext: ExtContext,
    activationReloadState: ActivationReloadState = new ActivationReloadState()
) {
    let createResult: Result = 'Succeeded'
    let reason: string | undefined
    let samVersion: string | undefined
    const samInitState: SamInitState | undefined = activationReloadState.getSamInitState()
    try {
        const templateUri = vscode.Uri.file(samInitState!.template!)
        const readmeUri = vscode.Uri.file(samInitState!.readme!)
        const folder = vscode.workspace.getWorkspaceFolder(templateUri)
        if (!folder) {
            createResult = 'Failed'
            reason = 'error'
            // Should never happen, because `samInitState.path` is only set if
            // `uri` is in the newly-added workspace folder.
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.samcli.initWizard.source.error.notInWorkspace',
                    "Could not open file '{0}'. If this file exists on disk, try adding it to your workspace.",
                    templateUri.fsPath
                )
            )

            return
        }

        samVersion = await getSamCliVersion(getSamCliContext())

        const configs = await addInitialLaunchConfiguration(
            extContext,
            folder,
            templateUri,
            samInitState?.isImage ? (samInitState?.runtime as Runtime | undefined) : undefined
        )
        const tryOpenReadme = await writeToolkitReadme(readmeUri.fsPath, configs)
        if (tryOpenReadme) {
            await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
        }
    } catch (err) {
        createResult = 'Failed'
        reason = 'error'

        globals.outputChannel.show(true)
        getLogger('channel').error(
            localize('AWS.samcli.initWizard.resume.error', 'Error resuming SAM Application creation. {0}', checklogs())
        )

        getLogger().error('Error resuming new SAM Application: %O', err as Error)
    } finally {
        activationReloadState.clearSamInitState()
        const arch = samInitState?.architecture as LambdaArchitecture
        telemetry.sam_init.emit({
            lambdaPackageType: samInitState?.isImage ? 'Image' : 'Zip',
            lambdaArchitecture: arch,
            result: createResult,
            reason: reason,
            runtime: samInitState?.runtime as Runtime,
            version: samVersion,
        })
    }
}

export interface CreateNewSamApplicationResults {
    runtime: string
    result: Result
}

/**
 * Runs `sam init` in the given context and returns useful metadata about its invocation
 */
export async function createNewSamApplication(
    extContext: ExtContext,
    samCliContext: SamCliContext = getSamCliContext(),
    activationReloadState: ActivationReloadState = new ActivationReloadState()
): Promise<void> {
    const awsContext: AwsContext = extContext.awsContext
    const regionProvider: RegionProvider = extContext.regionProvider
    let createResult: Result = 'Succeeded'
    let reason: string | undefined
    let lambdaPackageType: 'Zip' | 'Image' | undefined
    let createRuntime: Runtime | undefined
    let samVersion: string | undefined

    let initArguments: SamCliInitArgs | undefined

    try {
        await validateSamCli(samCliContext.validator)

        const credentials = await awsContext.getCredentials()
        samVersion = await getSamCliVersion(samCliContext)
        const schemaRegions = regionProvider.getRegions().filter(r => regionProvider.isServiceInRegion('schemas', r.id))
        const defaultRegion = awsContext.getCredentialDefaultRegion()

        const config = await new CreateNewSamAppWizard({
            credentials,
            schemaRegions,
            defaultRegion,
            samCliVersion: samVersion,
        }).run()

        if (!config) {
            createResult = 'Cancelled'
            reason = 'userCancelled'

            return
        }

        createRuntime = config.runtimeAndPackage.runtime as Runtime

        initArguments = {
            name: config.name,
            location: config.location.fsPath,
            dependencyManager: config.dependencyManager,
            architecture: config.architecture,
        }

        let request: SchemaCodeDownloadRequestDetails
        let schemaCodeDownloader: SchemaCodeDownloader
        let schemaTemplateParameters: SchemaTemplateParameters
        let client: SchemaClient
        if (config.template === eventBridgeStarterAppTemplate) {
            client = new DefaultSchemaClient(config.region!)
            schemaTemplateParameters = await buildSchemaTemplateParameters(
                config.schemaName!,
                config.registryName!,
                client
            )

            initArguments.extraContent = schemaTemplateParameters.templateExtraContent
        }

        if (config.runtimeAndPackage.packageType === 'Image') {
            lambdaPackageType = 'Image'
            initArguments.baseImage = `amazon/${createRuntime}-base`
        } else {
            lambdaPackageType = 'Zip'
            initArguments.runtime = createRuntime
            // in theory, templates could be provided with image-based lambdas, but that is currently not supported by SAM
            initArguments.template = config.template
        }

        await runSamCliInit(initArguments, samCliContext)

        const templateUri = await getProjectUri(config, samInitTemplateFiles)
        if (!templateUri) {
            reason = 'fileNotFound'

            return
        }

        const readmeUri = vscode.Uri.file(path.join(path.dirname(templateUri.fsPath), samInitReadmeFile))

        // Needs to be done or else gopls won't start
        if (goRuntimes.includes(createRuntime)) {
            try {
                execFileSync('go', ['mod', 'tidy'], { cwd: path.join(path.dirname(templateUri.fsPath), 'hello-world') })
            } catch (err) {
                getLogger().warn(
                    localize(
                        'AWS.message.warning.gotidyfailed',
                        'Failed to initialize package directory with "go mod tidy". Launch config will not be automatically created.'
                    )
                )
            }
        }

        if (config.template === eventBridgeStarterAppTemplate) {
            const destinationDirectory = path.join(config.location.fsPath, config.name, 'hello_world_function')
            request = {
                registryName: config.registryName!,
                schemaName: config.schemaName!,
                language: getApiValueForSchemasDownload(createRuntime),
                schemaVersion: schemaTemplateParameters!.SchemaVersion,
                destinationDirectory: vscode.Uri.file(destinationDirectory),
            }
            schemaCodeDownloader = createSchemaCodeDownloaderObject(client!, globals.outputChannel)
            getLogger('channel').info(
                localize(
                    'AWS.message.info.schemas.downloadCodeBindings.start',
                    'Downloading code for schema {0}...',
                    config.schemaName!
                )
            )

            await schemaCodeDownloader!.downloadCode(request!)

            void vscode.window.showInformationMessage(
                localize(
                    'AWS.message.info.schemas.downloadCodeBindings.finished',
                    'Downloaded code for schema {0}!',
                    request!.schemaName
                )
            )
        }

        // In case adding the workspace folder triggers a VS Code restart, persist relevant state to be used after reload
        activationReloadState.setSamInitState({
            template: templateUri.fsPath,
            readme: readmeUri.fsPath,
            runtime: createRuntime,
            isImage: config.runtimeAndPackage.packageType === 'Image',
            architecture: initArguments?.architecture,
        })

        await addFolderToWorkspace(
            {
                uri: config.location,
                name: path.basename(config.location.fsPath),
            },
            true
        )

        // Race condition where SAM app is created but template doesn't register in time.
        // Poll for 5 seconds, otherwise direct user to codelens.
        const isTemplateRegistered = await waitUntil(
            async () => (await globals.templateRegistry).getItem(templateUri),
            {
                timeout: 5000,
                interval: 500,
                truthy: false,
            }
        )

        let tryOpenReadme: boolean = false

        if (isTemplateRegistered) {
            const newLaunchConfigs = await addInitialLaunchConfiguration(
                extContext,
                vscode.workspace.getWorkspaceFolder(templateUri)!,
                templateUri,
                createRuntime
            )
            tryOpenReadme = await writeToolkitReadme(readmeUri.fsPath, newLaunchConfigs)
            if (newLaunchConfigs && newLaunchConfigs.length > 0) {
                void showCompletionNotification(
                    config.name,
                    `"${newLaunchConfigs.map(config => config.name).join('", "')}"`
                )
            }
            reason = 'complete'
        } else {
            createResult = 'Failed'
            reason = 'fileNotFound'

            const helpText = localize('AWS.generic.message.getHelp', 'Get Help...')
            void vscode.window
                .showWarningMessage(
                    localize(
                        'AWS.samcli.initWizard.launchConfigFail',
                        'Created SAM application "{0}" but failed to generate launch configurations. You can generate these via {1} in the template or handler file.',
                        config.name,
                        getIdeProperties().codelens
                    ),
                    helpText
                )
                .then(async buttonText => {
                    if (buttonText === helpText) {
                        void openUrl(vscode.Uri.parse(launchConfigDocUrl))
                    }
                })
        }

        activationReloadState.clearSamInitState()

        if (tryOpenReadme) {
            await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
        } else {
            await vscode.workspace.openTextDocument(templateUri)
        }
    } catch (err) {
        createResult = getTelemetryResult(err)
        reason = getTelemetryReason(err)

        globals.outputChannel.show(true)
        getLogger('channel').error(
            localize('AWS.samcli.initWizard.general.error', 'Error creating new SAM Application. {0}', checklogs())
        )

        getLogger().error('Error creating new SAM Application: %O', err as Error)

        // An error occured, so do not try to continue during the next extension activation
        activationReloadState.clearSamInitState()
    } finally {
        telemetry.sam_init.emit({
            lambdaPackageType: lambdaPackageType,
            lambdaArchitecture: initArguments?.architecture,
            result: createResult,
            reason: reason,
            runtime: createRuntime,
            version: samVersion,
        })
    }
}

async function validateSamCli(samCliValidator: SamCliValidator): Promise<void> {
    const validationResult = await samCliValidator.detectValidSamCli()
    throwAndNotifyIfInvalid(validationResult)
}

export async function getProjectUri(
    config: Pick<CreateNewSamAppWizardForm, 'location' | 'name'>,
    files: string[]
): Promise<vscode.Uri | undefined> {
    if (files.length === 0) {
        throw Error('expected "files" parameter to have at least one item')
    }
    let file: string
    let cfnTemplatePath: string
    for (const f of files) {
        file = f
        cfnTemplatePath = path.resolve(config.location.fsPath, config.name, file)
        if (await fileExists(cfnTemplatePath)) {
            return vscode.Uri.file(cfnTemplatePath)
        }
    }
    void vscode.window.showWarningMessage(
        localize(
            'AWS.samcli.initWizard.source.error.notFound',
            'Project created successfully, but {0} file not found: {1}',
            file!,
            cfnTemplatePath!
        )
    )
}

/**
 * Adds intial launch configurations when a new SAM app is created.
 * The template file must be within the same root directory as the target file.
 */
export async function addInitialLaunchConfiguration(
    extContext: ExtContext,
    folder: vscode.WorkspaceFolder,
    targetUri: vscode.Uri,
    runtime?: Runtime,
    launchConfiguration: LaunchConfiguration = new LaunchConfiguration(folder.uri)
): Promise<vscode.DebugConfiguration[] | undefined> {
    const configurations = await new SamDebugConfigProvider(extContext).provideDebugConfigurations(folder)
    if (configurations) {
        // add configurations that target the new template file
        const targetDir: string = path.dirname(targetUri.fsPath)
        const filtered = configurations.filter(config => {
            let templatePath: string = (config.invokeTarget as TemplateTargetProperties).templatePath
            templatePath = replaceVscodeVars(templatePath, folder.uri.fsPath)

            return (
                isTemplateTargetProperties(config.invokeTarget) &&
                isInDirectory(targetDir, tryGetAbsolutePath(folder, templatePath))
            )
        })

        // optional for ZIP-lambdas but required for Image-lambdas
        if (runtime !== undefined) {
            filtered.forEach(configuration => {
                if (!configuration.lambda) {
                    configuration.lambda = {}
                }
                configuration.lambda.runtime = runtime
            })
        }

        await launchConfiguration.addDebugConfigurations(filtered)
        return filtered
    }
}

async function showCompletionNotification(appName: string, configs: string): Promise<void> {
    const openJson = localize('AWS.generic.open', 'Open {0}', 'launch.json')
    const learnMore = localize('AWS.generic.message.learnMore', 'Learn More')
    const action = await vscode.window.showInformationMessage(
        localize(
            'AWS.samcli.initWizard.completionMessage',
            'Created SAM application "{0}" and added launch configurations to launch.json: {1}',
            appName,
            configs
        ),
        openJson,
        learnMore
    )

    if (action === openJson) {
        await openLaunchJsonFile()
    } else if (action === learnMore) {
        void openUrl(vscode.Uri.parse(debugNewSamAppUrl))
    }
}

/**
 * Creates a new SAM readme tailored to the IDE and created launch configs
 * @param readmeLocation Location of new readme file
 * @param configurations Debug configs to list in readme
 * @returns True on success, false otherwise
 */
export async function writeToolkitReadme(
    readmeLocation: string,
    configurations: vscode.DebugConfiguration[] = [],
    getText: (path: string) => Promise<string> = readFileAsString
): Promise<boolean> {
    try {
        const configString: string = configurations.reduce((acc, cur) => `${acc}\n* ${cur.name}`, '')
        const readme = (await getText(globals.context.asAbsolutePath(samInitReadmeSource)))
            .replace(/\$\{PRODUCTNAME\}/g, `${getIdeProperties().company} Toolkit For ${getIdeProperties().longName}`)
            .replace(/\$\{IDE\}/g, getIdeProperties().shortName)
            .replace(/\$\{CODELENS\}/g, getIdeProperties().codelens)
            .replace(/\$\{COMPANYNAME\}/g, getIdeProperties().company)
            .replace(/\$\{COMMANDPALETTE\}/g, getIdeProperties().commandPalette)
            .replace(/\$\{LISTOFCONFIGURATIONS\}/g, configString)
            .replace(
                /\$\{DOCURL\}/g,
                isCloud9()
                    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/serverless-apps-toolkit.html'
                    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html'
            )

        await writeFile(readmeLocation, readme)
        getLogger().debug(`writeToolkitReadme: wrote file: %O`, readmeLocation)

        return true
    } catch (e) {
        getLogger().error(`writeToolkitReadme failed, skip adding toolkit readme: ${(e as Error).message}`)

        return false
    }
}
