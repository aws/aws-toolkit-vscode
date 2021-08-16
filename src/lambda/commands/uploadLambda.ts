/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

import * as AdmZip from 'adm-zip'
import * as fs from 'fs'
import * as path from 'path'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { ext } from '../../shared/extensionGlobals'
import { fileExists, makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext } from '../../shared/sam/cli/samCliContext'
import * as telemetry from '../../shared/telemetry/telemetry'
import { SamTemplateGenerator } from '../../shared/templates/sam/samTemplateGenerator'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import { Window } from '../../shared/vscode/window'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { getLambdaDetails } from '../utils'
import { getIdeProperties } from '../../shared/extensionUtilities'

/**
 * Executes the "Upload Lambda..." command.
 * Allows for uploads of zip files, and both built and unbuilt directories.
 * Does not discriminate on runtime.
 * @param functionNode Function node from AWS Explorer
 */
export async function uploadLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await selectUploadTypeAndRunUpload(functionNode)

    telemetry.recordLambdaUpdateFunctionCode({
        result,
        runtime: functionNode.configuration.Runtime as telemetry.Runtime | undefined,
    })
}

/**
 * Selects the type of file to upload (zip/dir) and proceeds with the rest of the workflow.
 * @param functionNode Function node from AWS Explorer
 */
async function selectUploadTypeAndRunUpload(functionNode: LambdaFunctionNode): Promise<telemetry.Result> {
    const uploadZipItem: vscode.QuickPickItem = {
        label: addCodiconToString('file-zip', localize('AWS.generic.filetype.zipfile', 'ZIP Archive')),
    }
    const uploadDirItem: vscode.QuickPickItem = {
        label: addCodiconToString('folder', localize('AWS.generic.filetype.directory', 'Directory')),
    }

    // TODO: Add help button? Consult with doc writers.
    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.lambda.upload.title', 'Select Upload Type'),
            step: 1,
            totalSteps: 1,
        },
        items: [uploadZipItem, uploadDirItem],
        buttons: [vscode.QuickInputButtons.Back],
    })
    const response = verifySinglePickerOutput(
        await promptUser({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
    )

    if (!response) {
        return 'Cancelled'
    }

    if (response === uploadZipItem) {
        return await runUploadLambdaZipFile(functionNode)
    } else {
        return await runUploadDirectory(functionNode)
    }
}

/**
 * Allows the user to decide whether or not they want to build the directory in question and proceeds with the rest of the deployment workflow.
 * @param functionNode Function node from AWS Explorer
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadDirectory(
    functionNode: LambdaFunctionNode,
    window = Window.vscode()
): Promise<telemetry.Result> {
    const parentDir = await selectFolderForUpload()

    if (!parentDir) {
        return await selectUploadTypeAndRunUpload(functionNode)
    }

    const zipDirItem: vscode.QuickPickItem = {
        label: addCodiconToString('exclude', localizedText.no),
        detail: localize(
            'AWS.lambda.upload.prebuiltDir.detail',
            '{0} Toolkit will upload a ZIP of the selected directory.',
            getIdeProperties().company
        ),
    }
    const buildDirItem: vscode.QuickPickItem = {
        label: addCodiconToString('gear', localizedText.yes),
        detail: localize(
            'AWS.lambda.upload.unbuiltDir.detail',
            '{0} Toolkit will attempt to build the selected directory using the sam build command.',
            getIdeProperties().company
        ),
    }

    // TODO: Add help button? Consult with doc writers.
    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.lambda.upload.buildDirectory.title', 'Build directory?'),
            step: 2,
            totalSteps: 2,
        },
        items: [zipDirItem, buildDirItem],
        buttons: [vscode.QuickInputButtons.Back],
    })
    const response = verifySinglePickerOutput(
        await promptUser({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        })
    )

    if (!response) {
        return await selectUploadTypeAndRunUpload(functionNode)
    }

    if (!(await confirmLambdaDeployment(functionNode))) {
        return 'Cancelled'
    }

    if (response === zipDirItem) {
        return await window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
            },
            async progress => {
                return await zipAndUploadDirectory(functionNode, parentDir.fsPath, progress)
            }
        )
    } else {
        return await runUploadLambdaWithSamBuild(functionNode, parentDir)
    }
}

/**
 * Selects a folder for upload. Returns selected folder URI on success.
 * Otherwise, returns undefined if nothing is selected or if more than one folder is selected (should never happen)
 * Does not vet return URI type; this is left up to VS Code.
 * @param window Wrapper around vscode.window functionality for testing
 */
async function selectFolderForUpload(window = Window.vscode()): Promise<vscode.Uri | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    const parentDirArr = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: workspaceFolders[0]?.uri,
    })

    if (!parentDirArr || parentDirArr.length !== 1) {
        return undefined
    }

    return parentDirArr[0]
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
    functionNode: LambdaFunctionNode,
    parentDir: vscode.Uri,
    window = Window.vscode()
): Promise<telemetry.Result> {
    // Detect if handler is present and provide strong guidance against proceeding if not.
    try {
        const handlerFile = path.join(parentDir.fsPath, getLambdaDetails(functionNode.configuration).fileName)
        if (!(await fileExists(handlerFile))) {
            const isConfirmed = await showConfirmationMessage(
                {
                    prompt: localize(
                        'AWS.lambda.upload.handlerNotFound',
                        "{0} Toolkit can't find a file corresponding to handler: {1} at filepath {2}.\n\nThis directory likely will not work with this function.\n\nProceed with upload anyway?",
                        getIdeProperties().company,
                        functionNode.configuration.Handler,
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
                    .withFunctionHandler(functionNode.configuration.Handler!)
                    .withResourceName(resourceName)
                    .withRuntime(functionNode.configuration.Runtime!)
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
                return await zipAndUploadDirectory(functionNode, path.join(buildDir, resourceName), progress)
            } catch (e) {
                const err = e as Error
                window.showErrorMessage(err.message)
                getLogger().error('runUploadLambdaWithSamBuild failed: ', err.message)

                return 'Failed'
            } finally {
                await tryRemoveFolder(tempDir)
            }
        }
    )
}

/**
 * Confirms whether or not the user wants to deploy the Lambda as it is a destructive action.
 * @param functionNode Function node from AWS Explorer
 * @param window Wrapper around vscode.window functionality for testing
 */
async function confirmLambdaDeployment(functionNode: LambdaFunctionNode, window = Window.vscode()): Promise<boolean> {
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.lambda.upload.confirm',
                'This will immediately publish the selected code as the $LATEST version of Lambda: {0}.\n\nContinue?',
                functionNode.functionName
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
 * @param functionNode Function node from AWS Explorer
 * @param window Wrapper around vscode.window functionality for testing
 */
async function runUploadLambdaZipFile(
    functionNode: LambdaFunctionNode,
    window = Window.vscode()
): Promise<telemetry.Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    const zipFileArr = await window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false,
        defaultUri: workspaceFolders[0]?.uri,
        filters: {
            'ZIP archive': ['zip'],
        },
    })

    if (!zipFileArr || zipFileArr.length !== 1) {
        return 'Cancelled'
    }

    const isConfirmed = await confirmLambdaDeployment(functionNode)

    return isConfirmed
        ? await window.withProgress(
              {
                  location: vscode.ProgressLocation.Notification,
                  cancellable: false,
              },
              async progress => {
                  try {
                      const zipFile = fs.readFileSync(zipFileArr[0].fsPath)
                      return await uploadZipBuffer(functionNode, zipFile, progress)
                  } catch (e) {
                      const err = e as Error
                      Window.vscode().showErrorMessage(err.message)
                      getLogger().error('runUploadLambdaZipFile failed: ', err.message)

                      return 'Failed'
                  }
              }
          )
        : 'Cancelled'
}

/**
 * Zips a selected directory in memory and attempts to upload archive to Lambda
 * @param functionNode Function node from AWS Explorer
 * @param path Directory path to zip
 * @param progress Progress notification for displaying a status message
 */
async function zipAndUploadDirectory(
    functionNode: LambdaFunctionNode,
    path: string,
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>
): Promise<telemetry.Result> {
    try {
        progress.report({ message: localize('AWS.lambda.upload.progress.archivingDir', 'Archiving files...') })
        const zipBuffer = await new Promise<Buffer>(resolve => {
            const zip = new AdmZip()
            zip.addLocalFolder(path)
            resolve(zip.toBuffer())
        })

        return await uploadZipBuffer(functionNode, zipBuffer, progress)
    } catch (e) {
        const err = e as Error
        Window.vscode().showErrorMessage(err.message)
        getLogger().error('zipAndUploadDirectory failed: ', err.message)

        return 'Failed'
    }
}

/**
 * Attempts to upload Buffer representation of a `.zip` file to an existing Lambda function
 * @param functionNode Function node from AWS Explorer
 * @param zip Buffer to upload to Lambda
 * @param progress Progress notification for displaying a status message
 * @param lambdaClient Overwriteable Lambda client for testing purposes
 */
async function uploadZipBuffer(
    functionNode: LambdaFunctionNode,
    zip: Buffer,
    progress: vscode.Progress<{
        message?: string | undefined
        increment?: number | undefined
    }>,
    lambdaClient = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
): Promise<telemetry.Result> {
    try {
        progress.report({
            message: localize('AWS.lambda.upload.progress.uploadingArchive', 'Uploading archive to Lambda...'),
        })
        await lambdaClient.updateFunctionCode(functionNode.configuration.FunctionName!, zip)

        Window.vscode().showInformationMessage(
            localize('AWS.lambda.upload.done', 'Successfully uploaded Lambda function {0}', functionNode.functionName)
        )
        return 'Succeeded'
    } catch (e) {
        const err = e as Error
        Window.vscode().showErrorMessage(err.message)
        getLogger().error('uploadZipBuffer failed: ', err.message)

        return 'Failed'
    }
}
