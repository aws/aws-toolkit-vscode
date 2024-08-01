/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { join } from 'path'
import { getLogger } from './logger/logger'
import { telemetry } from './telemetry'

/**
 * Checks if the extension has been uninstalled by reading the .obsolete file
 * and comparing the number of obsolete extensions with the installed extensions.
 *
 * @param {string} context - The name extension context.
 * @param {string} obsoleteFilePath - The path to the .obsolete file.
 * @param {string} extensionsDirPath - The path to the extensions directory.
 * @returns {void}
 */
async function checkExtensionUninstall(
    extensionName: string,
    obsoleteFilePath: string,
    extensionsDirPath: string
): Promise<void> {
    try {
        const [obsoleteFileContent, extensionsDirContent] = await Promise.all([
            vscode.workspace.fs.readFile(vscode.Uri.file(obsoleteFilePath)),
            vscode.workspace.fs.readDirectory(vscode.Uri.file(extensionsDirPath)),
        ])

        const obsoleteExtensions = JSON.parse(obsoleteFileContent.toString())
        const obsoleteExtensionsCount = Object.keys(obsoleteExtensions).filter((id) =>
            id.includes(extensionName)
        ).length
        const installedExtensionsCount = extensionsDirContent
            .map(([name]) => name)
            .filter((name) => name.includes(extensionName)).length

        if (installedExtensionsCount === obsoleteExtensionsCount) {
            await vscode.commands.executeCommand(
                'vscode.open',
                'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/amazonq.html'
            )
            getLogger().info(`UninstallExtension: ${extensionName} uninstalled successfully`)
            telemetry.record({ id: `uninstall_${extensionName}` })
        }
    } catch (error) {
        getLogger().error(`UninstallExtension: Failed to check .obsolete: ${error}`)
    }
}

/**
 * Sets up a file system watcher to monitor the .obsolete file for changes and handle
 * extension un-installation if the extension is marked as obsolete.
 *
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {void}
 */
export function handleUninstall(context: vscode.ExtensionContext): void {
    try {
        const extensionPath = context.extensionPath
        const pathComponents = extensionPath.split('/').slice(0, -1)
        const extensionsDirPath = pathComponents.join('/')

        const obsoleteFilePath = join(extensionsDirPath, '.obsolete')

        if (extensionsDirPath && obsoleteFilePath) {
            const watchPattern = new vscode.RelativePattern(extensionsDirPath, '.obsolete')
            const fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern)

            const checkUninstallHandler = () =>
                checkExtensionUninstall(context.extension.id, obsoleteFilePath, extensionsDirPath)
            fileWatcher.onDidCreate(checkUninstallHandler)
            fileWatcher.onDidChange(checkUninstallHandler)

            context.subscriptions.push(fileWatcher)
        }
    } catch (error) {
        getLogger().error(`UninstallExtension: Failed to register un-installation: ${error}`)
    }
}
