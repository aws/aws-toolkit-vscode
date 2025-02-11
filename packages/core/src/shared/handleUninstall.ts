/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Implementation inspired by https://github.com/sourcegraph/sourcegraph-public-snapshot/blob/c864f15af264f0f456a6d8a83290b5c940715349/client/vscode/src/settings/uninstall.ts#L2

import * as vscode from 'vscode'
import { existsSync } from 'fs' // eslint-disable-line no-restricted-imports
import * as semver from 'semver'
import { join } from 'path'
import { getLogger } from './logger/logger'
import { telemetry } from './telemetry/telemetry'
import { VSCODE_EXTENSION_ID } from './extensions'

/**
 * Checks if an extension has been uninstalled and performs a callback if so.
 * This function differentiates between an uninstall and an auto-update.
 *
 * @param extensionId - The ID of the extension to check (e.g., VSCODE_EXTENSION_ID.awstoolkit)
 * @param extensionsPath - The file system path to the VS Code extensions directory
 * @param obsoletePath - The file system path to the .obsolete file
 * @param onUninstallCallback - A callback function to execute if the extension is uninstalled
 */
async function checkExtensionUninstall(
    extensionId: typeof VSCODE_EXTENSION_ID.awstoolkit | typeof VSCODE_EXTENSION_ID.amazonq,
    extensionVersion: string,
    extensionsPath: string,
    obsoletePath: string,
    onUninstallCallback: () => Promise<void>
): Promise<void> {
    const extensionFullName = `${extensionId}-${extensionVersion}`

    try {
        const [obsoleteFileContent, extensionDirEntries] = await Promise.all([
            vscode.workspace.fs.readFile(vscode.Uri.file(obsoletePath)),
            vscode.workspace.fs.readDirectory(vscode.Uri.file(extensionsPath)),
        ])

        const obsoleteExtensions = JSON.parse(obsoleteFileContent.toString())
        const currentExtension = vscode.extensions.getExtension(extensionId)

        if (!currentExtension) {
            // Check if the extension was previously installed and is now in the obsolete list
            const wasObsolete = Object.keys(obsoleteExtensions).some((id) => id.startsWith(extensionId))
            if (wasObsolete) {
                await handleUninstall(extensionFullName, onUninstallCallback)
            }
        } else {
            // Check if there's a newer version in the extensions directory
            const newerVersionExists = checkForNewerVersion(extensionDirEntries, extensionId, extensionVersion)

            if (!newerVersionExists) {
                // No newer version exists, so this is likely an uninstall
                await handleUninstall(extensionFullName, onUninstallCallback)
            } else {
                getLogger().info(`UpdateExtension: ${extensionFullName} is being updated - not an uninstall`)
            }
        }
    } catch (error) {
        getLogger().error(`UninstallExtension: Failed to check .obsolete: ${error}`)
    }
}

/**
 * Checks if a newer version of the extension exists in the extensions directory.
 * The isExtensionInstalled fn is used to determine if the extension is installed using the vscode API
 * whereas this function checks for the newer version in the extension directory for scenarios where
 * the old extension is un-installed and the new extension in downloaded but not installed.
 *
 * @param dirEntries - The entries in the extensions directory
 * @param extensionId - The ID of the extension to check
 * @param currentVersion - The current version of the extension
 * @returns True if a newer version exists, false otherwise
 */

function checkForNewerVersion(
    dirEntries: [string, vscode.FileType][],
    extensionId: string,
    currentVersion: string
): boolean {
    const versionRegex = new RegExp(`^${extensionId}-(.+)$`)

    return dirEntries
        .map(([name]) => name)
        .filter((name) => name.startsWith(extensionId))
        .some((name) => {
            const match = name.match(versionRegex)
            if (match && match[1]) {
                const version = semver.valid(semver.coerce(match[1]))
                return version !== null && semver.gt(version, currentVersion)
            }
            return false
        })
}

/**
 * Handles the uninstall process by calling the callback and logging the event.
 *
 * @param extensionFullName - The full name of the extension including version
 * @param callback - The callback function to execute on uninstall
 */
async function handleUninstall(extensionFullName: string, callback: () => Promise<void>): Promise<void> {
    await callback()
    telemetry.aws_extensionUninstalled.run(() => {})
    getLogger().info(`UninstallExtension: ${extensionFullName} uninstalled successfully`)
}

/**
 * Sets up a file system watcher to monitor the .obsolete file for changes and handle
 * extension un-installation if the extension is marked as obsolete.
 *
 * @param {string} extensionName - The name of the extension.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @param {function} callback - Action performed when extension is uninstalled.
 * @returns {void}
 */
export function setupUninstallHandler(
    extensionName: typeof VSCODE_EXTENSION_ID.awstoolkit | typeof VSCODE_EXTENSION_ID.amazonq,
    extensionVersion: string,
    context: vscode.ExtensionContext,
    callback: () => Promise<void> = async () => {}
): void {
    try {
        const extensionPath = context.extensionPath
        const pathComponents = extensionPath.split('/').slice(0, -1)
        const extensionsDirPath = pathComponents.join('/')

        const obsoleteFilePath = join(extensionsDirPath, '.obsolete')

        if (extensionsDirPath && obsoleteFilePath && existsSync(obsoleteFilePath)) {
            const watchPattern = new vscode.RelativePattern(extensionsDirPath, '.obsolete')
            const fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern)

            const checkUninstallHandler = () =>
                checkExtensionUninstall(extensionName, extensionVersion, extensionsDirPath, obsoleteFilePath, callback)
            fileWatcher.onDidCreate(checkUninstallHandler)
            fileWatcher.onDidChange(checkUninstallHandler)

            context.subscriptions.push(fileWatcher)
        }
    } catch (error) {
        getLogger().error(`UninstallExtension: Failed to register un-installation: ${error}`)
    }
}
