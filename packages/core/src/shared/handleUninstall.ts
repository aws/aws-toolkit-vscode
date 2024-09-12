/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Implementation inspired by https://github.com/sourcegraph/sourcegraph-public-snapshot/blob/c864f15af264f0f456a6d8a83290b5c940715349/client/vscode/src/settings/uninstall.ts#L2

import * as vscode from 'vscode'
import { join } from 'path'
import { getLogger } from './logger/logger'
import { telemetry } from './telemetry'
import { VSCODE_EXTENSION_ID } from './extensions'
import { extensionVersion } from './vscode/env'

/**
 * Checks if the extension has been uninstalled by reading the .obsolete file
 * and comparing the number of obsolete extensions with the installed extensions.
 *
 * @param {string} extensionName - The name of the extension.
 * @param {string} extensionsDirPath - The path to the extensions directory.
 * @param {string} obsoleteFilePath - The path to the .obsolete file.
 * @param {function} callback - Action performed when extension is uninstalled.
 * @returns {void}
 */
async function checkExtensionUninstall(
    extensionName: typeof VSCODE_EXTENSION_ID.awstoolkit | typeof VSCODE_EXTENSION_ID.amazonq,
    extensionsDirPath: string,
    obsoleteFilePath: string,
    callback: () => Promise<void>
): Promise<void> {
    /**
     * Users can have multiple profiles with different versions of the extensions.
     *
     * This makes sure the callback is triggered only when an explicit extension with specific version is uninstalled.
     */
    const extension = `${extensionName}-${extensionVersion}`
    try {
        const [obsoleteFileContent, extensionsDirContent] = await Promise.all([
            vscode.workspace.fs.readFile(vscode.Uri.file(obsoleteFilePath)),
            vscode.workspace.fs.readDirectory(vscode.Uri.file(extensionsDirPath)),
        ])

        const installedExtensionsCount = extensionsDirContent
            .map(([name]) => name)
            .filter((name) => name.includes(extension)).length

        const obsoleteExtensions = JSON.parse(obsoleteFileContent.toString())
        const obsoleteExtensionsCount = Object.keys(obsoleteExtensions).filter((id) => id.includes(extension)).length

        if (installedExtensionsCount === obsoleteExtensionsCount) {
            await callback()
            telemetry.aws_extensionUninstalled.run((span) => {
                span.record({})
            })
            getLogger().info(`UninstallExtension: ${extension} uninstalled successfully`)
        }
    } catch (error) {
        getLogger().error(`UninstallExtension: Failed to check .obsolete: ${error}`)
    }
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
    context: vscode.ExtensionContext,
    callback: () => Promise<void> = async () => {}
): void {
    try {
        const extensionPath = context.extensionPath
        const pathComponents = extensionPath.split('/').slice(0, -1)
        const extensionsDirPath = pathComponents.join('/')

        const obsoleteFilePath = join(extensionsDirPath, '.obsolete')

        if (extensionsDirPath && obsoleteFilePath) {
            const watchPattern = new vscode.RelativePattern(extensionsDirPath, '.obsolete')
            const fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern)

            const checkUninstallHandler = () =>
                checkExtensionUninstall(extensionName, extensionsDirPath, obsoleteFilePath, callback)
            fileWatcher.onDidCreate(checkUninstallHandler)
            fileWatcher.onDidChange(checkUninstallHandler)

            context.subscriptions.push(fileWatcher)
        }
    } catch (error) {
        getLogger().error(`UninstallExtension: Failed to register un-installation: ${error}`)
    }
}
