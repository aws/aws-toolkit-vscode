/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import * as vscode from 'vscode'
import { SchemaClient } from '../../../src/shared/clients/schemaClient'
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
import { ext } from '../../shared/extensionGlobals'
import { fileExists, isInDirectory } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../../shared/regions/regionUtilities'
import { getSamCliVersion, getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { SamCliValidator } from '../../shared/sam/cli/samCliValidator'
import { recordSamInit, Result, Runtime as TelemetryRuntime } from '../../shared/telemetry/telemetry'
import { makeCheckLogsMessage } from '../../shared/utilities/messages'
import { addFolderToWorkspace, tryGetAbsolutePath } from '../../shared/utilities/workspaceUtils'
import { goRuntimes } from '../models/samLambdaRuntime'
import { eventBridgeStarterAppTemplate } from '../models/samTemplates'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardResponse,
    DefaultCreateNewSamAppWizardContext,
} from '../wizards/samInitWizard'
import { LaunchConfiguration } from '../../shared/debug/launchConfiguration'
import { SamDebugConfigProvider } from '../../shared/sam/debugger/awsSamDebugger'
import { ExtContext } from '../../shared/extensions'
import { isTemplateTargetProperties } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { TemplateTargetProperties } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { openLaunchJsonFile } from '../../shared/sam/debugger/commands/addSamDebugConfiguration'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { debugNewSamAppUrl, launchConfigDocUrl } from '../../shared/constants'
import { Runtime } from 'aws-sdk/clients/lambda'
import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'
import { execSync } from 'child_process'

type CreateReason = 'unknown' | 'userCancelled' | 'fileNotFound' | 'complete' | 'error'

export const SAM_INIT_TEMPLATE_FILES: string[] = ['template.yaml', 'template.yml']
export const SAM_INIT_README_FILE: string = 'README.md'

export async function resumeCreateNewSamApp(
    extContext: ExtContext,
    activationReloadState: ActivationReloadState = new ActivationReloadState()
) {
    let createResult: Result = 'Succeeded'
    let reason: CreateReason = 'complete'
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
            vscode.window.showErrorMessage(
                localize(
                    'AWS.samcli.initWizard.source.error.notInWorkspace',
                    "Could not open file '{0}'. If this file exists on disk, try adding it to your workspace.",
                    templateUri.fsPath
                )
            )

            return
        }

        samVersion = await getSamCliVersion(getSamCliContext())

        await addInitialLaunchConfiguration(
            extContext,
            folder,
            templateUri,
            samInitState?.isImage ? samInitState?.runtime : undefined
        )
        isCloud9()
            ? await vscode.workspace.openTextDocument(readmeUri)
            : await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    } catch (err) {
        createResult = 'Failed'
        reason = 'error'

        const checkLogsMessage = makeCheckLogsMessage()

        ext.outputChannel.show(true)
        getLogger('channel').error(
            localize(
                'AWS.samcli.initWizard.resume.error',
                'An error occured while resuming SAM Application creation. {0}',
                checkLogsMessage
            )
        )

        getLogger().error('Error resuming new SAM Application: %O', err as Error)
    } finally {
        activationReloadState.clearSamInitState()
        recordSamInit({
            lambdaPackageType: samInitState?.isImage ? 'Image' : 'Zip',
            result: createResult,
            reason: reason,
            runtime: samInitState?.runtime as TelemetryRuntime,
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
    let reason: CreateReason = 'unknown'
    let lambdaPackageType: 'Zip' | 'Image' | undefined
    let createRuntime: Runtime | undefined
    let config: CreateNewSamAppWizardResponse | undefined
    let samVersion: string | undefined

    let initArguments: SamCliInitArgs

    try {
        await validateSamCli(samCliContext.validator)

        const currentCredentials = await awsContext.getCredentials()
        const availableRegions = getRegionsForActiveCredentials(awsContext, regionProvider)
        const schemasRegions = availableRegions.filter(region => regionProvider.isServiceInRegion('schemas', region.id))
        samVersion = await getSamCliVersion(samCliContext)

        const wizardContext = new DefaultCreateNewSamAppWizardContext(currentCredentials, schemasRegions, samVersion)
        config = await new CreateNewSamAppWizard(wizardContext).run()

        if (!config) {
            createResult = 'Cancelled'
            reason = 'userCancelled'

            return
        }

        // This cast (and all like it) will always succeed because Runtime (from config.runtime) is the same
        // section of types as Runtime
        createRuntime = config.runtime as Runtime

        initArguments = {
            name: config.name,
            location: config.location.fsPath,
            dependencyManager: config.dependencyManager,
        }

        let request: SchemaCodeDownloadRequestDetails
        let schemaCodeDownloader: SchemaCodeDownloader
        let schemaTemplateParameters: SchemaTemplateParameters
        let client: SchemaClient
        if (config.template === eventBridgeStarterAppTemplate) {
            client = ext.toolkitClientBuilder.createSchemaClient(config.region!)
            schemaTemplateParameters = await buildSchemaTemplateParameters(
                config.schemaName!,
                config.registryName!,
                client
            )

            initArguments.extraContent = schemaTemplateParameters.templateExtraContent
        }

        if (config.packageType === 'Image') {
            lambdaPackageType = 'Image'
            initArguments.baseImage = `amazon/${createRuntime}-base`
        } else {
            lambdaPackageType = 'Zip'
            initArguments.runtime = createRuntime
            // in theory, templates could be provided with image-based lambdas, but that is currently not supported by SAM
            initArguments.template = config.template
        }

        await runSamCliInit(initArguments, samCliContext)

        const templateUri = await getProjectUri(config, SAM_INIT_TEMPLATE_FILES)
        const readmeUri = await getProjectUri(config, [SAM_INIT_README_FILE])
        if (!templateUri || !readmeUri) {
            reason = 'fileNotFound'

            return
        }

        // Needs to be done or else gopls won't start
        if (goRuntimes.includes(createRuntime)) {
            try {
                execSync('go mod tidy', { cwd: path.join(path.dirname(readmeUri.fsPath), 'hello-world') })
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
            schemaCodeDownloader = createSchemaCodeDownloaderObject(client!, ext.outputChannel)
            getLogger('channel').info(
                localize(
                    'AWS.message.info.schemas.downloadCodeBindings.start',
                    'Downloading code for schema {0}...',
                    config.schemaName!
                )
            )

            await schemaCodeDownloader!.downloadCode(request!)

            vscode.window.showInformationMessage(
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
            isImage: config.packageType === 'Image',
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
        const isTemplateRegistered = await waitUntil(async () => ext.templateRegistry.getRegisteredItem(templateUri), {
            timeout: 5000,
            interval: 500,
            truthy: false,
        })

        if (isTemplateRegistered) {
            const newLaunchConfigs = await addInitialLaunchConfiguration(
                extContext,
                vscode.workspace.getWorkspaceFolder(templateUri)!,
                templateUri,
                createRuntime
            )
            if (newLaunchConfigs && newLaunchConfigs.length > 0) {
                showCompletionNotification(config.name, `"${newLaunchConfigs.map(config => config.name).join('", "')}"`)
            }
            reason = 'complete'
        } else {
            createResult = 'Failed'
            reason = 'fileNotFound'

            const helpText = localize('AWS.generic.message.getHelp', 'Get Help...')
            vscode.window
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
                        vscode.env.openExternal(vscode.Uri.parse(launchConfigDocUrl))
                    }
                })
        }

        activationReloadState.clearSamInitState()
        // TODO: Replace when Cloud9 supports `markdown` commands
        isCloud9()
            ? await vscode.workspace.openTextDocument(readmeUri)
            : await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    } catch (err) {
        createResult = 'Failed'
        reason = 'error'

        const checkLogsMessage = makeCheckLogsMessage()

        ext.outputChannel.show(true)
        getLogger('channel').error(
            localize(
                'AWS.samcli.initWizard.general.error',
                'An error occurred while creating a new SAM Application. {0}',
                checkLogsMessage
            )
        )

        getLogger().error('Error creating new SAM Application: %O', err as Error)

        // An error occured, so do not try to continue during the next extension activation
        activationReloadState.clearSamInitState()
    } finally {
        recordSamInit({
            lambdaPackageType: lambdaPackageType,
            result: createResult,
            reason: reason,
            runtime: createRuntime as TelemetryRuntime,
            version: samVersion,
        })
    }
}

async function validateSamCli(samCliValidator: SamCliValidator): Promise<void> {
    const validationResult = await samCliValidator.detectValidSamCli()
    throwAndNotifyIfInvalid(validationResult)
}

export async function getProjectUri(
    config: Pick<CreateNewSamAppWizardResponse, 'location' | 'name'>,
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
    vscode.window.showWarningMessage(
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
            // TODO: write utility function that does this for other variables too
            templatePath = templatePath.replace('${workspaceFolder}', folder.uri.fsPath)

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
        vscode.env.openExternal(vscode.Uri.parse(debugNewSamAppUrl))
    }
}
