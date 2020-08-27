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
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SamTemplateGenerator } from '../../shared/templates/sam/samTemplateGenerator'
import { SamCliBuildInvocation } from '../../shared/sam/cli/samCliBuild'
import { getSamCliContext } from '../../shared/sam/cli/samCliContext'
import { ExtensionDisposableFiles } from '../../shared/utilities/disposableFiles'
import { getLogger } from '../../shared/logger'
import { ext } from '../../shared/extensionGlobals'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import { showConfirmationMessage } from '../../s3/util/messages'

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
        label: localize('AWS.lambda.upload.prebuiltZip', 'Built function in a ZIP archive'),
        detail: localize('AWS.lambda.upload.prebuiltZip.detail', 'The Toolkit will upload the selected ZIP archive.'),
    }
    const zipDirItem: vscode.QuickPickItem = {
        label: localize('AWS.lambda.upload.prebuiltDir', 'Built function in a directory'),
        detail: localize(
            'AWS.lambda.upload.prebuiltDir.detail',
            'The Toolkit will upload a ZIP of the selected directory.'
        ),
    }
    const buildDirItem: vscode.QuickPickItem = {
        label: localize('AWS.lambda.upload.unbuiltDir', 'Unbuilt function in a directory'),
        description: 'WIP!!!!!!', // TODO: Remove
        detail: localize(
            'AWS.lambda.upload.unbuiltDir.detail',
            'The Toolkit will attempt to build the selected directory using the sam build command.'
        ),
    }

    // TODO: Add help button? Consult with doc writers.
    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.lambda.upload.title', 'Select Upload Type'),
        },
        items: [uploadZipItem, zipDirItem, buildDirItem],
    })
    const response = verifySinglePickerOutput(await promptUser({ picker: picker }))

    if (!response) {
        return 'Cancelled'
    }

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.lambda.upload.confirm',
                'This will immediately publish the selected code as a new version of Lambda: {0}.\n\nThe Toolkit cannot guarantee that the built code will work.\n\nContinue?',
                functionNode.functionName
            ),
            confirm: localize('AWS.generic.response.yes', 'Yes'),
            cancel: localize('AWS.generic.response.no', 'No'),
        },
        window
    )

    if (!isConfirmed) {
        getLogger().info('ImportLambda cancelled')
        return 'Cancelled'
    }

    if (response === uploadZipItem) {
        return await runUploadLambdaZipFile(functionNode)
    } else if (response === zipDirItem) {
        return await runUploadLambdaDirectory(functionNode)
    } else {
        return await runUploadLambdaWithSamBuild(functionNode)
    }
}

async function runUploadLambdaDirectory(
    functionNode: LambdaFunctionNode,
    window = Window.vscode()
): Promise<telemetry.Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    const parentDirArr = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: workspaceFolders[0]?.uri,
    })

    if (!parentDirArr || parentDirArr.length !== 1) {
        return 'Cancelled'
    }

    return await zipAndUploadDirectory(functionNode, parentDirArr[0].fsPath)
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

    return await uploadZipBuffer(functionNode, zipFile)
}

async function runUploadLambdaWithSamBuild(
    functionNode: LambdaFunctionNode,
    window = Window.vscode()
): Promise<telemetry.Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    const parentDirArr = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: workspaceFolders[0]?.uri,
    })

    if (!parentDirArr || parentDirArr.length !== 1) {
        return 'Cancelled'
    }

    // TODO: Detect if handler is present and error out prematurely?
    // TODO: What should we do if no manifest (package.json, requirements.txt, etc.) is present? Directory won't be `sam build`-able.

    try {
        const invoker = getSamCliContext().invoker
        const parentDir = parentDirArr[0]

        const tempDir = await makeTemporaryToolkitFolder()
        ExtensionDisposableFiles.getInstance().addFolder(tempDir)
        const templatePath = path.join(tempDir, 'template.yaml')

        // TODO: Use an existing template file if it's present?

        await new SamTemplateGenerator()
            .withFunctionHandler(functionNode.configuration.Handler!)
            .withResourceName('tempResource')
            .withRuntime(functionNode.configuration.Runtime!)
            .withCodeUri(parentDir.fsPath)
            .generate(templatePath)

        const buildDir = path.join(tempDir, 'output')
        await new SamCliBuildInvocation({
            buildDir,
            templatePath,
            invoker,
            skipPullImage: true,
            useContainer: false,
            baseDir: parentDir.fsPath,
        }).execute()

        // TODO: Remove template file if generating one?
        // TODO: Find correct directory to zip. Needs to be compatible with function's handler since we won't overwrite that.

        return await zipAndUploadDirectory(functionNode, buildDir)
    } catch (e) {
        const err = e as Error
        window.showErrorMessage(err.message)
        getLogger().error('runUploadLambdaWithSamBuild failed: ', err.message)

        return 'Failed'
    }
}

async function zipAndUploadDirectory(
    functionNode: LambdaFunctionNode,
    path: string,
    window = Window.vscode()
): Promise<telemetry.Result> {
    try {
        const zipBuffer = await new Promise<Buffer>(resolve => {
            const zip = new AdmZip()
            zip.addLocalFolder(path)
            resolve(zip.toBuffer())
        })

        return await uploadZipBuffer(functionNode, zipBuffer)
    } catch (e) {
        const err = e as Error
        window.showErrorMessage(err.message)
        getLogger().error('zipAndUploadDirectory failed: ', err.message)

        return 'Failed'
    }
}

async function uploadZipBuffer(
    functionNode: LambdaFunctionNode,
    zip: Buffer,
    window = Window.vscode()
): Promise<telemetry.Result> {
    try {
        const lambdaClient = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
        await lambdaClient.updateFunctionCode(functionNode.configuration.FunctionName!, zip)

        return 'Succeeded'
    } catch (e) {
        const err = e as Error
        window.showErrorMessage(err.message)
        getLogger().error('uploadZipBuffer failed: ', err.message)

        return 'Failed'
    }
}
