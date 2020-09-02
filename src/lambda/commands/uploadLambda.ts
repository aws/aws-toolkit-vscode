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
import * as telemetry from '../../shared/telemetry/telemetry'
import { Window } from '../../shared/vscode/window'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { makeTemporaryToolkitFolder, fileExists } from '../../shared/filesystemUtilities'
import { SamTemplateGenerator } from '../../shared/templates/sam/samTemplateGenerator'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext } from '../../shared/sam/cli/samCliContext'
import { ExtensionDisposableFiles } from '../../shared/utilities/disposableFiles'
import { getLogger } from '../../shared/logger'
import { ext } from '../../shared/extensionGlobals'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import { showConfirmationMessage } from '../../s3/util/messages'
import { getLambdaFileNameFromHandler } from '../utils'

export async function uploadLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await selectUploadTypeAndConfirm(functionNode)

    telemetry.recordLambdaUpdateFunctionCode({
        result,
        runtime: functionNode.configuration.Runtime as telemetry.Runtime | undefined,
    })
}

async function selectUploadTypeAndConfirm(
    functionNode: LambdaFunctionNode,
    window = Window.vscode()
): Promise<telemetry.Result> {
    const uploadZipItem: vscode.QuickPickItem = {
        label: `$(file-zip) ${localize('AWS.generic.filetype.zipfile', 'ZIP Archive')}`,
    }
    const uploadDirItem: vscode.QuickPickItem = {
        label: `$(folder) ${localize('AWS.generic.filetype.directory', 'Directory')}`,
    }

    // TODO: Add help button? Consult with doc writers.
    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.lambda.upload.title', 'Select Upload Type'),
        },
        items: [uploadZipItem, uploadDirItem],
    })
    const response = verifySinglePickerOutput(await promptUser({ picker: picker }))

    if (!response) {
        return 'Cancelled'
    }

    if (response === uploadZipItem) {
        return await runUploadLambdaZipFile(functionNode)
    } else {
        return await runUploadDirectory(functionNode)
    }
}

async function runUploadDirectory(functionNode: LambdaFunctionNode): Promise<telemetry.Result> {
    const parentDir = await selectFolderForUpload()

    if (!parentDir) {
        return 'Cancelled'
    }

    const zipDirItem: vscode.QuickPickItem = {
        label: `$(exclude) ${localize('AWS.generic.response.no', 'No')}`,
        detail: localize(
            'AWS.lambda.upload.prebuiltDir.detail',
            'AWS Toolkit will upload a ZIP of the selected directory.'
        ),
    }
    const buildDirItem: vscode.QuickPickItem = {
        label: `$(gear) ${localize('AWS.generic.response.yes', 'Yes')}`,
        detail: localize(
            'AWS.lambda.upload.unbuiltDir.detail',
            'AWS Toolkit will attempt to build the selected directory using the sam build command.'
        ),
    }

    // TODO: Add help button? Consult with doc writers.
    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.lambda.upload.buildDirectory.title', 'Build directory?'),
        },
        items: [zipDirItem, buildDirItem],
    })
    const response = verifySinglePickerOutput(await promptUser({ picker: picker }))

    if (!response) {
        return 'Cancelled'
    }

    if (!(await confirmLambdaDeployment(functionNode))) {
        return 'Cancelled'
    }

    if (response === zipDirItem) {
        return await zipAndUploadDirectory(functionNode, parentDir.fsPath)
    } else {
        return await runUploadLambdaWithSamBuild(functionNode, parentDir)
    }
}

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

async function runUploadLambdaWithSamBuild(
    functionNode: LambdaFunctionNode,
    parentDir: vscode.Uri,
    window = Window.vscode()
): Promise<telemetry.Result> {
    // Detect if handler is present and provide strong guidance against proceeding if not.
    try {
        const handlerFile = path.join(parentDir.fsPath, getLambdaFileNameFromHandler(functionNode.configuration))
        if (!(await fileExists(handlerFile))) {
            const isConfirmed = await showConfirmationMessage(
                {
                    prompt: localize(
                        'AWS.lambda.upload.handlerNotFound',
                        "AWS Toolkit can't find a file corresponding to handler: {0} at filepath {1}.\n\nThis directory likely will not work with this function.\n\nProceed with upload anyway?",
                        functionNode.configuration.Handler,
                        handlerFile
                    ),
                    confirm: localize('AWS.generic.response.yes', 'Yes'),
                    cancel: localize('AWS.generic.response.no', 'No'),
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

    try {
        const invoker = getSamCliContext().invoker

        const tempDir = await makeTemporaryToolkitFolder()
        ExtensionDisposableFiles.getInstance().addFolder(tempDir)
        const templatePath = path.join(tempDir, 'template.yaml')
        const resourceName = 'tempResource'

        // TODO: Use an existing template file if it's present?

        await new SamTemplateGenerator()
            .withFunctionHandler(functionNode.configuration.Handler!)
            .withResourceName(resourceName)
            .withRuntime(functionNode.configuration.Runtime!)
            .withCodeUri(parentDir.fsPath)
            .generate(templatePath)

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
        return await zipAndUploadDirectory(functionNode, path.join(buildDir, resourceName))
    } catch (e) {
        const err = e as Error
        window.showErrorMessage(err.message)
        getLogger().error('runUploadLambdaWithSamBuild failed: ', err.message)

        return 'Failed'
    }
}

async function confirmLambdaDeployment(functionNode: LambdaFunctionNode, window = Window.vscode()): Promise<boolean> {
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.lambda.upload.confirm',
                'This will immediately publish the selected code as a new version of Lambda: {0}.\n\nAWS Toolkit cannot guarantee that the built code will work.\n\nContinue?',
                functionNode.functionName
            ),
            confirm: localize('AWS.generic.response.yes', 'Yes'),
            cancel: localize('AWS.generic.response.no', 'No'),
        },
        window
    )

    if (!isConfirmed) {
        getLogger().info('UploadLambda confirmation cancelled.')
    }

    return isConfirmed
}

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

    const zipFile = fs.readFileSync(zipFileArr[0].fsPath)

    const isConfirmed = await confirmLambdaDeployment(functionNode)

    return isConfirmed ? await uploadZipBuffer(functionNode, zipFile) : 'Cancelled'
}

async function zipAndUploadDirectory(functionNode: LambdaFunctionNode, path: string): Promise<telemetry.Result> {
    try {
        const zipBuffer = await new Promise<Buffer>(resolve => {
            const zip = new AdmZip()
            zip.addLocalFolder(path)
            resolve(zip.toBuffer())
        })

        return await uploadZipBuffer(functionNode, zipBuffer)
    } catch (e) {
        const err = e as Error
        Window.vscode().showErrorMessage(err.message)
        getLogger().error('zipAndUploadDirectory failed: ', err.message)

        return 'Failed'
    }
}

async function uploadZipBuffer(
    functionNode: LambdaFunctionNode,
    zip: Buffer,
    lambdaClient = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
): Promise<telemetry.Result> {
    try {
        await lambdaClient.updateFunctionCode(functionNode.configuration.FunctionName!, zip)

        return 'Succeeded'
    } catch (e) {
        const err = e as Error
        Window.vscode().showErrorMessage(err.message)
        getLogger().error('uploadZipBuffer failed: ', err.message)

        return 'Failed'
    }
}
