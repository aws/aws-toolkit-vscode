/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

import * as AdmZip from 'adm-zip'
import * as fs from 'fs-extra'
import * as path from 'path'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { fileExists, makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext } from '../../shared/sam/cli/samCliContext'
import * as telemetry from '../../shared/telemetry/telemetry'
import { SamTemplateGenerator } from '../../shared/templates/sam/samTemplateGenerator'
import { Window } from '../../shared/vscode/window'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { getLambdaDetails } from '../utils'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { StepEstimator, Wizard, WIZARD_BACK } from '../../shared/wizards/wizard'
import { createSingleFileDialog } from '../../shared/ui/common/openDialog'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { ToolkitError } from '../../shared/toolkitError'
import { FunctionConfiguration } from 'aws-sdk/clients/lambda'
import globals from '../../shared/extensionGlobals'

interface LambdaFunction {
    readonly name: string
    readonly region: string
    readonly configuration?: FunctionConfiguration
}

/**
 * Executes the "Upload Lambda..." command.
 * Allows for uploads of zip files, and both built and unbuilt directories.
 * Does not discriminate on runtime.
 * @param functionNode Function node from AWS Explorer
 */
export async function uploadLambdaCommand(functionNode: LambdaFunctionNode) {
    let result: telemetry.Result = 'Cancelled'
    const lambda = {
        name: functionNode.functionName,
        region: functionNode.regionCode,
        configuration: functionNode.configuration,
    }

    try {
        const response = await new UploadLambdaWizard(lambda).run()

        if (response?.uploadType === 'zip') {
            await runUploadLambdaZipFile(lambda, response.targetUri)
            result = 'Succeeded'
        } else if (response?.uploadType === 'directory' && response.directoryUploadType) {
            result = (await runUploadDirectory(lambda, response.directoryUploadType, response.targetUri)) ?? result
            result = 'Succeeded'
        }
        // TODO(sijaden): potentially allow the wizard to easily support tagged-union states
    } catch (err) {
        result = 'Failed'
        if (err instanceof ToolkitError) {
            showViewLogsMessage(`Could not upload lambda: ${err.message}`)
            getLogger().error(`Lambda upload failed: %O`, err.cause ?? err)
        } else {
            showViewLogsMessage(`Could not upload lambda (unexpected exception)`)
            getLogger().error(`Lambda upload failed: %O`, err)
        }
    } finally {
        telemetry.recordLambdaUpdateFunctionCode({
            result,
            runtime: lambda.configuration.Runtime as telemetry.Runtime | undefined,
        })
    }
}

/**
 * Selects the type of file to upload (zip/dir) and proceeds with the rest of the workflow.
 * @param functionNode Function node from AWS Explorer
 */
function createUploadTypePrompter() {
    const items: DataQuickPickItem<'zip' | 'directory'>[] = [
        {
            label: addCodiconToString('file-zip', localize('AWS.generic.filetype.zipfile', 'ZIP Archive')),
            data: 'zip',
        },
        {
            label: addCodiconToString('folder', localize('AWS.generic.filetype.directory', 'Directory')),
            data: 'directory',
        },
    ]

    return createQuickPick(items, {
        title: localize('AWS.lambda.upload.title', 'Select Upload Type'),
        buttons: createCommonButtons(),
    })
}

function createDirectoryUploadPrompter() {
    const items: DataQuickPickItem<'zip' | 'sam'>[] = [
        {
            label: addCodiconToString('exclude', localizedText.no),
            detail: localize(
                'AWS.lambda.upload.prebuiltDir.detail',
                '{0} Toolkit will upload a ZIP of the selected directory.',
                getIdeProperties().company
            ),
            data: 'zip',
        },
        {
            label: addCodiconToString('gear', localizedText.yes),
            detail: localize(
                'AWS.lambda.upload.unbuiltDir.detail',
                '{0} Toolkit will attempt to build the selected directory using the sam build command.',
                getIdeProperties().company
            ),
            data: 'sam',
        },
    ]

    return createQuickPick(items, {
        title: localize('AWS.lambda.upload.buildDirectory.title', 'Build directory?'),
        buttons: createCommonButtons(),
    })
}

function createConfirmDeploymentPrompter(lambda: LambdaFunction) {
    // TODO(sijaden): make this a quick pick? Tried to keep as close to possible as the original impl.
    return new (class extends Prompter<boolean> {
        protected promptUser(): Promise<PromptResult<boolean>> {
            return confirmLambdaDeployment(lambda) || WIZARD_BACK
        }

        // Stubs. Need to thin-out the `Prompter` interface to avoid this.
        public setStepEstimator(estimator: StepEstimator<boolean>): void {}
        public setSteps(current: number, total: number): void {}

        public set recentItem(response: any) {}
        public get recentItem(): any {
            return undefined
        }
    })()
}

interface UploadLambdaWizardState {
    readonly uploadType: 'zip' | 'directory'
    readonly targetUri: vscode.Uri
    readonly directoryUploadType?: 'zip' | 'sam'
    readonly confirmedDeploy: boolean
}

class UploadLambdaWizard extends Wizard<UploadLambdaWizardState> {
    constructor(lambda: LambdaFunction) {
        super()

        this.form.uploadType.bindPrompter(() => createUploadTypePrompter())

        this.form.targetUri.bindPrompter(({ uploadType }) => {
            if (uploadType === 'directory') {
                return createSingleFileDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                })
            } else {
                return createSingleFileDialog({
                    canSelectFolders: false,
                    canSelectFiles: true,
                    filters: {
                        'ZIP archive': ['zip'],
                    },
                })
            }
        })

        this.form.directoryUploadType.bindPrompter(() => createDirectoryUploadPrompter(), {
            showWhen: ({ uploadType }) => uploadType === 'directory',
        })

        this.form.confirmedDeploy.bindPrompter(() => createConfirmDeploymentPrompter(lambda))
    }
}

/**
 * Allows the user to decide whether or not they want to build the directory in question and proceeds with the rest of the deployment workflow.
 * @param functionNode Function node from AWS Explorer
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadDirectory(
    lambda: Required<LambdaFunction>,
    type: 'zip' | 'sam',
    parentDir: vscode.Uri,
    window = Window.vscode()
) {
    if (type === 'zip') {
        return await window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            },
            async progress => {
                return await zipAndUploadDirectory(lambda, parentDir.fsPath, progress)
            }
        )
    } else {
        return await runUploadLambdaWithSamBuild(lambda, parentDir)
    }
}

/**
 * Attempts to build a project using `sam build`.
 * * Checks supported interpreted languages to see if the handler file exists (based on upstream handler name)
 * * Creates a temporary template based on the parent dir and the upstream handler name
 * * Executes `sam build` on the temporary template
 * * Sends directory to be archived and uploaded
 * @param functionNode Function node from AWS Explorer
 * @param parentDir Parent dir to build
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadLambdaWithSamBuild(
    lambda: Required<LambdaFunction>,
    parentDir: vscode.Uri,
    window = Window.vscode()
) {
    // Detect if handler is present and provide strong guidance against proceeding if not.
    try {
        const handlerFile = path.join(parentDir.fsPath, getLambdaDetails(lambda.configuration).fileName)
        if (!(await fileExists(handlerFile))) {
            const isConfirmed = await showConfirmationMessage(
                {
                    prompt: localize(
                        'AWS.lambda.upload.handlerNotFound',
                        "{0} Toolkit can't find a file corresponding to handler: {1} at filepath {2}.\n\nThis directory likely will not work with this function.\n\nProceed with upload anyway?",
                        getIdeProperties().company,
                        lambda.configuration.Handler,
                        handlerFile
                    ),
                    confirm: localizedText.yes,
                    cancel: localizedText.no,
                },
                window
            )

            if (!isConfirmed) {
                getLogger().info('Handler file not found. Aborting runUploadLambdaWithSamBuild')
                return 'Cancelled'
            }
        }
    } catch (e) {
        // TODO: Give provisional support for Ruby?
        getLogger().info(
            'Attempting to build a runtime that AWS Toolkit does not have handler validation for. Ignoring handler check.'
        )
    }

    return await window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            let tempDir: string | undefined
            try {
                const invoker = getSamCliContext().invoker

                tempDir = await makeTemporaryToolkitFolder()
                const templatePath = path.join(tempDir, 'template.yaml')
                const resourceName = 'tempResource'

                // TODO: Use an existing template file if it's present?
                progress.report({
                    message: localize(
                        'AWS.lambda.upload.progress.generatingTemplate',
                        'Setting up temporary build files...'
                    ),
                })
                await new SamTemplateGenerator()
                    .withFunctionHandler(lambda.configuration.Handler!)
                    .withResourceName(resourceName)
                    .withRuntime(lambda.configuration.Runtime!)
                    .withCodeUri(parentDir.fsPath)
                    .generate(templatePath)

                progress.report({
                    message: localize(
                        'AWS.lambda.upload.progress.samBuilding',
                        'Building project via sam build command...'
                    ),
                })
                const buildDir = path.join(tempDir, 'output')
                // Note: `sam build` will fail if the selected directory does not have a valid manifest file:
                // https://github.com/awslabs/aws-sam-cli/blob/4f12dc74ca8ff6fddd661711db7c3048812b4119/designs/sam_build_cmd.md#built-in-build-actions
                await new SamCliBuildInvocation({
                    buildDir,
                    templatePath,
                    invoker,
                    skipPullImage: true,
                    useContainer: false,
                    baseDir: parentDir.fsPath,
                }).execute()

                // App builds into a folder named after the resource name. Zip the contents of that, not the whole output dir.
                return await zipAndUploadDirectory(lambda, path.join(buildDir, resourceName), progress)
            } catch (err) {
                throw new ToolkitError('Failed to build directory', { cause: err as Error })
            } finally {
                await tryRemoveFolder(tempDir)
            }
        }
    )
}

/**
 * Confirms whether or not the user wants to deploy the Lambda as it is a destructive action.
 * @param functionName Name of the Lambda function
 * @param window Wrapper around vscode.window functionality for testing
 */
async function confirmLambdaDeployment(lambda: LambdaFunction, window = Window.vscode()): Promise<boolean> {
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.lambda.upload.confirm',
                'This will immediately publish the selected code as the $LATEST version of Lambda: {0}.\n\nContinue?',
                lambda.name
            ),
            confirm: localizedText.yes,
            cancel: localizedText.no,
        },
        window
    )

    if (!isConfirmed) {
        getLogger().info('UploadLambda confirmation cancelled.')
    }

    return isConfirmed
}

/**
 * Prompts the user to select a `.zip` file for upload to Lambda, confirms, and attempts to upload.
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadLambdaZipFile(lambda: LambdaFunction, zipFileUri: vscode.Uri, window = Window.vscode()) {
    return await window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            const zipFile = await fs.readFile(zipFileUri.fsPath).catch(err => {
                throw new ToolkitError('Failed to read zip', { cause: err })
            })
            return await uploadZipBuffer(lambda, zipFile, progress)
        }
    )
}

/**
 * Zips a selected directory in memory and attempts to upload archive to Lambda
 * @param path Directory path to zip
 * @param progress Progress notification for displaying a status message
 */
async function zipAndUploadDirectory(
    lambda: LambdaFunction,
    path: string,
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>
) {
    progress.report({ message: localize('AWS.lambda.upload.progress.archivingDir', 'Archiving files...') })
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const zip = new AdmZip()
        zip.addLocalFolder(path)
        zip.toBuffer(resolve, reject)
    }).catch(err => {
        throw new ToolkitError('Failed to archive directory', { cause: err })
    })

    return await uploadZipBuffer(lambda, zipBuffer, progress)
}

/**
 * Attempts to upload Buffer representation of a `.zip` file to an existing Lambda function
 * @param zip Buffer to upload to Lambda
 * @param progress Progress notification for displaying a status message
 * @param lambdaClient Overwriteable Lambda client for testing purposes
 */
async function uploadZipBuffer(
    lambda: LambdaFunction,
    zip: Buffer,
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>,
    lambdaClient = globals.toolkitClientBuilder.createLambdaClient(lambda.region)
) {
    progress.report({
        message: localize('AWS.lambda.upload.progress.uploadingArchive', 'Uploading archive to Lambda...'),
    })
    await lambdaClient.updateFunctionCode(lambda.name, zip).catch(err => {
        throw new ToolkitError('Failed to upload zip archive', { cause: err })
    })

    Window.vscode().showInformationMessage(
        localize('AWS.lambda.upload.done', 'Successfully uploaded Lambda function {0}', lambda.name)
    )
}
