/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../../shared/extensionGlobals'
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
 * Executes the close all editors command and waits for the active editor to disappear
 */
export async function closeAllEditors() {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await waitUntil(async () => vscode.window.activeTextEditor === undefined, {
        timeout: 2500,
        interval: 50,
        truthy: true,
    })

    if (vscode.window.activeTextEditor) {
        console.log(vscode.window.activeTextEditor.document.getText()) // Just so I can see what the document actually is...
        throw new Error(
            `Window "${vscode.window.activeTextEditor.document.fileName}" was still open after executing "closeAllEditors"`
        )
    }
}
