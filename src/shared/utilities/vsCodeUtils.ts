/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../logger/logger'
import { waitUntil } from './timeoutUtils'

// TODO: Consider NLS initialization/configuration here & have packages to import localize from here
export const localize = nls.loadMessageBundle()

export function isFileIconThemeSeti(): boolean {
    const iconTheme = vscode.workspace.getConfiguration('workbench').get('iconTheme')
    return !iconTheme || iconTheme === 'vs-seti'
}

export function fileIconPath(): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
    // Workaround for https://github.com/microsoft/vscode/issues/85654
    // Once this is resolved, ThemeIcons can be used for seti as well
    if (isFileIconThemeSeti()) {
        return {
            dark: vscode.Uri.file(ext.iconPaths.dark.file),
            light: vscode.Uri.file(ext.iconPaths.light.file),
        }
    } else {
        return vscode.ThemeIcon.File
    }
}

export function folderIconPath(): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
    // Workaround for https://github.com/microsoft/vscode/issues/85654
    // Once this is resolved, ThemeIcons can be used for seti as well
    if (isFileIconThemeSeti()) {
        return {
            dark: vscode.Uri.file(ext.iconPaths.dark.folder),
            light: vscode.Uri.file(ext.iconPaths.light.folder),
        }
    } else {
        return vscode.ThemeIcon.Folder
    }
}

/**
 * Executes the close all editors command and waits for all visible editors to disappear
 */
export async function closeAllEditors() {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')

    // The output channel counts as an editor, but you can't really close that...
    const noVisibleEditor: boolean | undefined = await waitUntil(
        async () => {
            const visibleEditors = vscode.window.visibleTextEditors.filter(
                editor => !editor.document.fileName.includes('extension-output') // Output channels are named with the prefix 'extension-output'
            )

            return visibleEditors.length === 0
        },
        {
            timeout: 2500, // Arbitrary values. Should succeed except when VS Code is lagging heavily.
            interval: 250,
            truthy: true,
        }
    )

    if (!noVisibleEditor) {
        throw new Error(
            `Editor "${
                vscode.window.activeTextEditor!.document.fileName
            }" was still open after executing "closeAllEditors"`
        )
    }
}

/**
 * Checks if the given extension is installed and active.
 */
export function isExtensionActive(extId: string): boolean {
    const extension = vscode.extensions.getExtension(extId)
    return !!extension && extension.isActive
}

/**
 * Activates the given extension, or does nothing if the extension is not
 * installed.
 *
 * @param extId  Extension id
 * @param silent  Return undefined on failure, instead of throwing
 * @returns Extension object, or undefined on failure if `silent`
 */
export async function activateExtension(extId: string, silent: boolean = true): Promise<vscode.Extension<void> | undefined> {
    let loggerInitialized: boolean
    try {
        getLogger()
        loggerInitialized = true
    } catch {
        loggerInitialized = false
    }
    function log(s: string, ...rest: any[]): void {
        if (loggerInitialized) {
            getLogger().debug(s, ...rest)
        } else {
            console.log(s, ...rest)
        }
    }

    const extension = vscode.extensions.getExtension(extId)
    if (!extension) {
        if (silent) {
            return undefined
        }
        throw new Error(`Extension not found: ${extId}`)
    }

    if (!extension.isActive) {
        try {
            await extension.activate()
            log('Extension activated: %s', extId)
        } catch (err) {
            log('Extension failed to activate: %s: %O', extId, err as Error)
            if (!silent) {
                throw err
            }
            return undefined
        }
    }

    return extension
}
