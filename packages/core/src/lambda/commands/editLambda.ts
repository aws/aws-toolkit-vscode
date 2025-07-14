/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { downloadLambdaInLocation, openLambdaFile } from './downloadLambda'
import { LambdaFunction, runUploadDirectory } from './uploadLambda'
import {
    compareCodeSha,
    getFunctionInfo,
    getLambdaDetails,
    getTempLocation,
    lambdaTempPath,
    setFunctionInfo,
} from '../utils'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import fs from '../../shared/fs/fs'
import globals from '../../shared/extensionGlobals'
import { LambdaFunctionNodeDecorationProvider } from '../explorer/lambdaFunctionNodeDecorationProvider'
import path from 'path'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { getFunctionWithCredentials } from '../../shared/clients/lambdaClient'
import { getLogger } from '../../shared/logger/logger'

const localize = nls.loadMessageBundle()

let lastPromptTime = Date.now() - 5000

export function watchForUpdates(lambda: LambdaFunction, projectUri: vscode.Uri): void {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(projectUri, '*'))
    const startTime = globals.clock.Date.now()

    watcher.onDidChange(async (fileUri) => {
        await promptForSync(lambda, projectUri, fileUri)
    })

    watcher.onDidCreate(async (fileUri) => {
        // When the code is downloaded and the watcher is set, this will immediately trigger the onDidCreate
        // To avoid this, we must check that the file was actually created AFTER the watcher was created
        if ((await fs.stat(fileUri.fsPath)).ctime < startTime) {
            return
        }
        await promptForSync(lambda, projectUri, fileUri)
    })

    watcher.onDidDelete(async (fileUri) => {
        // We don't want to sync if the whole directory has been deleted or emptied
        if (fileUri.fsPath !== projectUri.fsPath) {
            // Check if directory is empty before prompting for sync
            try {
                const entries = await fs.readdir(projectUri.fsPath)
                if (entries.length > 0) {
                    await promptForSync(lambda, projectUri, fileUri)
                }
            } catch (err) {
                getLogger().debug(`Failed to check Lambda directory contents: ${err}`)
            }
        }
    })
}

// Creating this function for testing, can't mock the vscode.window in the tests
export async function promptDeploy() {
    const confirmItem = localize('AWS.lambda.upload.sync', 'Deploy')
    const cancelItem = localize('AWS.lambda.upload.noSync', 'No, thanks')
    const response = await vscode.window.showInformationMessage(
        localize('AWS.lambda.upload.confirmSync', 'Would you like to deploy these changes to the cloud?'),
        confirmItem,
        cancelItem
    )
    return response === confirmItem
}

export async function promptForSync(lambda: LambdaFunction, projectUri: vscode.Uri, fileUri: vscode.Uri) {
    if (!(await fs.existsDir(projectUri.fsPath)) || globals.clock.Date.now() - lastPromptTime < 5000) {
        return
    }

    await setFunctionInfo(lambda, {
        undeployed: true,
    })

    await LambdaFunctionNodeDecorationProvider.getInstance().addBadge(
        fileUri,
        vscode.Uri.from({ scheme: 'lambda', path: `${lambda.region}/${lambda.name}` })
    )

    lastPromptTime = globals.clock.Date.now()
    if (await promptDeploy()) {
        await deployFromTemp(lambda, projectUri)
    }
}

export async function confirmOutdatedChanges(prompt: string): Promise<boolean> {
    return await showConfirmationMessage({
        prompt,
        confirm: localize('AWS.lambda.upload.overwrite', 'Overwrite'),
        cancel: localize('AWS.lambda.upload.noOverwrite', 'Cancel'),
    })
}

export async function deployFromTemp(lambda: LambdaFunction, projectUri: vscode.Uri) {
    return telemetry.lambda_quickDeploy.run(async () => {
        const prompt = localize(
            'AWS.lambda.upload.confirmOutdatedSync',
            'There are changes to your Function in the cloud after you created this local copy, overwrite anyway?'
        )

        const isShaDifferent = !(await compareCodeSha(lambda))
        const overwriteChanges = isShaDifferent ? await confirmOutdatedChanges(prompt) : true

        if (overwriteChanges) {
            // Reset the lastPrompt time because we don't want to retrigger the watcher flow
            lastPromptTime = globals.clock.Date.now()
            await vscode.workspace.saveAll()
            try {
                await runUploadDirectory(lambda, 'zip', projectUri)
            } catch {
                throw new ToolkitError('Failed to deploy Lambda function', { code: 'deployFailure' })
            }
            await setFunctionInfo(lambda, {
                lastDeployed: globals.clock.Date.now(),
                undeployed: false,
            })
            await LambdaFunctionNodeDecorationProvider.getInstance().removeBadge(
                projectUri,
                vscode.Uri.from({ scheme: 'lambda', path: `${lambda.region}/${lambda.name}` })
            )
            if (isShaDifferent) {
                telemetry.record({ action: 'overwriteChanges' })
            }
        } else {
            telemetry.record({ action: 'cancelOverwrite' })
        }
    })
}

export async function deleteFilesInFolder(location: string) {
    const entries = await fs.readdir(location)
    await Promise.all(
        entries.map((entry) => fs.delete(path.join(location, entry[0]), { recursive: true, force: true }))
    )
}

export async function editLambdaCommand(functionNode: LambdaFunctionNode) {
    const region = functionNode.regionCode
    const functionName = functionNode.configuration.FunctionName!
    return await editLambda({ name: functionName, region, configuration: functionNode.configuration }, 'explorer')
}

export async function overwriteChangesForEdit(lambda: LambdaFunction, downloadLocation: string) {
    try {
        // Clear directory contents instead of deleting to avoid Windows EBUSY errors
        if (await fs.existsDir(downloadLocation)) {
            await deleteFilesInFolder(downloadLocation)
        } else {
            await fs.mkdir(downloadLocation)
        }

        await downloadLambdaInLocation(lambda, 'local', downloadLocation)

        // Watching for updates, then setting info, then removing the badges must be done in this order
        // This is because the files creating can throw the watcher, which sometimes leads to changes being marked as undeployed
        watchForUpdates(lambda, vscode.Uri.file(downloadLocation))

        await setFunctionInfo(lambda, {
            lastDeployed: globals.clock.Date.now(),
            undeployed: false,
            sha: lambda.configuration!.CodeSha256,
            handlerFile: getLambdaDetails(lambda.configuration!).fileName,
        })
        await LambdaFunctionNodeDecorationProvider.getInstance().removeBadge(
            vscode.Uri.file(downloadLocation),
            vscode.Uri.from({ scheme: 'lambda', path: `${lambda.region}/${lambda.name}` })
        )
    } catch {
        throw new ToolkitError('Failed to download Lambda function', { code: 'failedDownload' })
    }
}

export async function editLambda(lambda: LambdaFunction, source?: 'workspace' | 'explorer') {
    return await telemetry.lambda_quickEditFunction.run(async () => {
        telemetry.record({ source })
        const downloadLocation = getTempLocation(lambda.name, lambda.region)

        // We don't want to do anything if the folder already exists as a workspace folder, it means it's already being edited
        if (vscode.workspace.workspaceFolders?.some((folder) => folder.uri.fsPath === downloadLocation)) {
            return downloadLocation
        }

        const prompt = localize(
            'AWS.lambda.download.confirmOutdatedSync',
            'There are changes to your function in the cloud since you last edited locally, do you want to overwrite your local changes?'
        )

        // We want to overwrite changes in the following cases:
        // 1. There is no code sha locally (getCodeShaLocal returns falsy)
        // 2. There is a code sha locally, it does not match the one remotely, and the user confirms they want to overwrite it
        const localExists = !!(await getFunctionInfo(lambda, 'sha'))
        // This record tells us if they're attempting to edit a function they've edited before
        telemetry.record({ action: localExists ? 'existingEdit' : 'newEdit' })

        const isDirectoryEmpty = (await fs.existsDir(downloadLocation))
            ? (await fs.readdir(downloadLocation)).length === 0
            : true

        const overwriteChanges =
            !localExists ||
            isDirectoryEmpty ||
            (!(await compareCodeSha(lambda)) ? await confirmOutdatedChanges(prompt) : false)

        if (overwriteChanges) {
            await overwriteChangesForEdit(lambda, downloadLocation)
        } else if (source === 'explorer') {
            // If the source is the explorer, we want to open, otherwise we just wait to open in the workspace
            const lambdaLocation = path.join(downloadLocation, getLambdaDetails(lambda.configuration!).fileName)
            await openLambdaFile(lambdaLocation)
            watchForUpdates(lambda, vscode.Uri.file(downloadLocation))
        }

        return downloadLocation
    })
}

export async function openLambdaFolderForEdit(name: string, region: string) {
    const downloadLocation = getTempLocation(name, region)

    // Do all authentication work before opening workspace to avoid race condition
    const getFunctionOutput = await getFunctionWithCredentials(region, name)
    const configuration = getFunctionOutput.Configuration

    // Download and set up Lambda code before opening workspace
    await editLambda(
        {
            name,
            region,
            configuration: configuration as any,
        },
        'workspace'
    )

    try {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(downloadLocation), {
            newWindow: true,
            noRecentEntry: true,
        })
    } catch (e) {
        throw new ToolkitError(`Failed to open your function as a workspace: ${e}`, { code: 'folderOpenFailure' })
    }
}

export async function getReadme(): Promise<string> {
    const readmeSource = path.join('resources', 'markdown', 'lambdaEdit.md')
    const readmeDestination = path.join(lambdaTempPath, 'README.md')
    try {
        const readmeContent = await fs.readFileText(globals.context.asAbsolutePath(readmeSource))
        await fs.writeFile(readmeDestination, readmeContent)
    } catch (e) {
        getLogger().info(`Failed to copy content for Lambda README: ${e}`)
    }

    try {
        const createStackIconSource = path.join('resources', 'icons', 'aws', 'lambda', 'create-stack-light.svg')
        const createStackIconDestination = path.join(lambdaTempPath, 'create-stack.svg')
        await fs.copy(globals.context.asAbsolutePath(createStackIconSource), createStackIconDestination)

        // Copy VS Code built-in icons
        const vscodeIconPath = path.join('resources', 'icons', 'vscode', 'light')

        const invokeIconSource = path.join(vscodeIconPath, 'run.svg')
        const invokeIconDestination = path.join(lambdaTempPath, 'invoke.svg')
        await fs.copy(globals.context.asAbsolutePath(invokeIconSource), invokeIconDestination)

        const deployIconSource = path.join(vscodeIconPath, 'cloud-upload.svg')
        const deployIconDestination = path.join(lambdaTempPath, 'deploy.svg')
        await fs.copy(globals.context.asAbsolutePath(deployIconSource), deployIconDestination)
    } catch (e) {
        getLogger().info(`Failed to copy content for Lambda README: ${e}`)
    }

    return readmeDestination
}
