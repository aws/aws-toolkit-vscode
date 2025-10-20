/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { VSCODE_EXTENSION_ID } from '../../shared/extensions'

import { glob } from 'glob'
import * as path from 'path'
import * as semver from 'semver'
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import fs from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'
import { showConfirmationMessage } from '../../shared/utilities/messages'

const logger = getLogger('sagemaker')

const pluginTechnicalName = 'sagemaker-ssh-kiro'
const pluginDisplayName = 'Amazon SageMaker SSH Plugin for Kiro'
const minKiroVersion = '0.3.0'

let updatedExtensionToVersion: string
let vscodeProductJson: any

async function getEditorProductJson() {
    if (!vscodeProductJson) {
        const productJsonPath = path.join(vscode.env.appRoot, 'product.json')
        logger.info(`Reading vscode product.json at ${productJsonPath}`)
        const productJsonStr = await fs.readFileText(productJsonPath)
        vscodeProductJson = JSON.parse(productJsonStr)
    }

    return vscodeProductJson
}

export async function getKiroVersion(): Promise<string> {
    return (await getEditorProductJson()).version
}

/**
 * Finds the embedded SageMaker SSH Kiro extension VSIX file and extracts its version.
 */
export async function findEmbeddedSageMakerSshKiroExtension(
    ctx: vscode.ExtensionContext
): Promise<{ path: string; version: string }> {
    const resourcesDir = ctx.asAbsolutePath('resources')

    try {
        // Use forward slashes for glob pattern
        const globPattern = path.join(resourcesDir, 'sagemaker-ssh-kiro-*.vsix').replace(/\\/g, '/')
        const matches = await glob(globPattern)
        if (matches.length === 0) {
            throw new ToolkitError(`The ${pluginTechnicalName} extension VSIX file not found in: ${resourcesDir}.`)
        }

        if (matches.length > 1) {
            // Multiple files could only happen if we built the toolkit extension incorrectly or if the user modified the extension directory.
            throw new ToolkitError(
                `Unexpectedly found multiple (${matches.length}) ${pluginTechnicalName} extension VSIX files in: ${resourcesDir}`
            )
        }

        const filePath = matches[0]
        const fileName = path.basename(filePath)
        const versionMatch = fileName.match(/^sagemaker-ssh-kiro-(.+)\.vsix$/)

        if (!versionMatch) {
            throw new ToolkitError(`Failed to extract version number from VSIX filename: ${fileName}`)
        }

        const version = versionMatch[1]
        logger.info(`Found the ${pluginTechnicalName} extension VSIX file: ${fileName} (version ${version})`)
        return { path: filePath, version }
    } catch (error) {
        if (error instanceof ToolkitError) {
            throw error
        }
        throw new ToolkitError(
            `An error occurred while searching for the ${pluginTechnicalName} extension VSIX file: ${error}`
        )
    }
}

/**
 * Ensures the SageMaker SSH Kiro extension is installed and up-to-date.
 */
export async function ensureSageMakerSshKiroExtension(ctx: vscode.ExtensionContext): Promise<void> {
    const kiroVersion = await getKiroVersion()

    if (semver.lt(kiroVersion, minKiroVersion)) {
        throw new ToolkitError(
            `SageMaker remote access requires Kiro version ${minKiroVersion} or higher (current: ${kiroVersion}). Update Kiro to continue.`
        )
    }

    logger.info(`Kiro version ${kiroVersion} meets minimum requirement (${minKiroVersion})`)

    // Find the embedded extension file and extract its version
    const { path: embeddedPath, version: embeddedVersion } = await findEmbeddedSageMakerSshKiroExtension(ctx)

    // Check if extension is already installed with the correct version
    const installedExtension = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.sagemakerSshKiro)
    const installedVersion = updatedExtensionToVersion ?? installedExtension?.packageJSON.version

    if (installedVersion) {
        if (installedVersion === embeddedVersion) {
            logger.info(
                `The ${pluginTechnicalName} extension is already installed with expected version ${embeddedVersion}.`
            )
            return
        } else {
            logger.info(
                `The ${pluginTechnicalName} extension is installed with version ${installedVersion}, but expected version ${embeddedVersion}`
            )
        }
    } else {
        logger.info(
            `The ${pluginTechnicalName} extension is not installed. Attempting to install version ${embeddedVersion}...`
        )
    }

    // Determine if this is an update or new installation
    const isUpdate = installedVersion !== undefined

    // Prompt user for confirmation
    const actionText = isUpdate ? 'update' : 'install'
    const confirmButtonText = isUpdate ? 'Update' : 'Install'
    const installOrUpdateQuestion = isUpdate
        ? `update from version ${installedVersion} to ${embeddedVersion}`
        : `install version ${embeddedVersion}`

    const ok = await showConfirmationMessage({
        prompt: `The ${pluginDisplayName} needs to be ${isUpdate ? 'updated' : 'installed'} to connect to the Space. Would you like to ${installOrUpdateQuestion}?`,
        confirm: confirmButtonText,
    })

    if (!ok) {
        void vscode.window.showInformationMessage(
            `Aborted connecting to the Space because you declined to ${actionText} the ${pluginDisplayName}.`
        )
        const cancellationErrorMessage = `User declined to ${actionText} the ${pluginTechnicalName} extension (version ${embeddedVersion}).`
        logger.info(cancellationErrorMessage)
        throw new ToolkitError(cancellationErrorMessage, { cancelled: true })
    }

    logger.info(`Installing the ${pluginTechnicalName} extension (version ${embeddedVersion}) from: ${embeddedPath}`)

    // Install the extension
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(embeddedPath))

    if (isUpdate) {
        // After the extension is updated, calls to `vscode.extensions.getExtension` will not reflect the change unless
        // the user restarts their extension host which would be disruptive as it would interrupt this entire flow, so
        // we need to remember the version that we updated to, or else we will prompt the user to update the extension
        // for every space connection attempt. Even if the current extension host is still running an older version of
        // the extension, the new remote workspace window will have a new extension host process so it will always take
        // the most recently installed version.
        updatedExtensionToVersion = embeddedVersion
    }

    logger.info(`Installed the ${pluginTechnicalName} extension (version ${embeddedVersion}).`)

    // Show success notification
    const successMessage = isUpdate
        ? `${pluginDisplayName} updated to version ${embeddedVersion}`
        : `${pluginDisplayName} installed (version ${embeddedVersion})`

    void vscode.window.showInformationMessage(successMessage)
}
