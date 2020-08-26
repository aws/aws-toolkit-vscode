/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AdmZip from 'adm-zip'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
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

export async function uploadLambdaCommand(functionNode: LambdaFunctionNode) {
    const result = await runUploadLambda(functionNode)

    telemetry.recordLambdaUpdateFunctionCode({
        result,
        runtime: functionNode.configuration.Runtime as telemetry.Runtime | undefined,
    })
}

async function runUploadLambda(functionNode: LambdaFunctionNode, window = Window.vscode()): Promise<telemetry.Result> {
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    const parentDirArr = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: workspaceFolders[0]?.uri,
        // openLabel: '' <-- TODO: Create correct terminology and localize
    })

    if (!parentDirArr || parentDirArr.length !== 1) {
        return 'Cancelled'
    }

    // TODO: Prompt confirmation
    // TODO: Detect if handler is present?

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

        const zipDir = path.join(tempDir, 'function.zip')
        await new Promise((resolve, reject) => {
            new AdmZip(buildDir).writeZip(zipDir, err => {
                if (err) {
                    // TODO: Localize
                    reject(`Failed to zip directory ${buildDir} to zip file: ${zipDir}`)
                }

                resolve()
            })
        })

        const lambdaClient = ext.toolkitClientBuilder.createLambdaClient(functionNode.regionCode)
        const zipBuffer = fs.readFileSync(zipDir)
        await lambdaClient.updateFunctionCode(functionNode.configuration.FunctionName!, zipBuffer)

        vscode.commands.executeCommand('aws.refreshAwsExplorerNode', functionNode.parent)
    } catch (e) {
        const err = e as Error
        window.showErrorMessage(err.message)
        getLogger().error('runUploadLambda failed: ', err.message)

        return 'Failed'
    }

    return 'Succeeded'
}
