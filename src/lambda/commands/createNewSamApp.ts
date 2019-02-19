/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { SamCliInitArgs, SamCliInitInvocation } from '../../shared/sam/cli/samCliInit'
import { getMainSourceFileUri } from '../utilities/getMainSourceFile'
import { CreateNewSamAppWizard } from '../wizards/samInitWizard'

export const MAIN_SOURCE_FILE_URI = 'MAIN_SOURCE_FILE_URI'

export async function resumeCreateNewSamApp(context: Pick<vscode.ExtensionContext, 'globalState'>) {
    const rawUri = context.globalState.get<string>(MAIN_SOURCE_FILE_URI)
    if (!rawUri) {
        return
    }

    const uri = vscode.Uri.file(rawUri)
    if (!vscode.workspace.getWorkspaceFolder(uri)) {
        vscode.window.showErrorMessage(`Document '${uri.fsPath}' is not in any active workspace folder`)

        return
    }

    await vscode.window.showTextDocument(uri)

    context.globalState.update(MAIN_SOURCE_FILE_URI, undefined)
}

export async function createNewSamApp(context: Pick<vscode.ExtensionContext, 'globalState'>): Promise<void> {
    const config = await new CreateNewSamAppWizard().run()
    if (!config) {
        return
    }

    const invocation = new SamCliInitInvocation(config)
    await invocation.execute()

    const uri = await getMainUri(config)
    if (!uri) {
        return
    }

    if (await addWorkspaceFolder(
        {
            uri: config.location,
            name: path.basename(config.location.fsPath)
        },
        uri
    )) {
        context.globalState.update(MAIN_SOURCE_FILE_URI, uri!.fsPath)
    } else {
        await vscode.window.showTextDocument(uri)
    }
}

async function getMainUri(config: Pick<SamCliInitArgs, 'location' | 'name'>): Promise<vscode.Uri | undefined> {
    try {
        return await getMainSourceFileUri({
            root: vscode.Uri.file(path.join(config.location.fsPath, config.name))
        })
    } catch (err) {
        vscode.window.showErrorMessage(localize(
            'AWS.samcli.initWizard.source.error.notFound',
            'Project created successfully, but main source code file not found: {0}'
        ))
    }
}

async function addWorkspaceFolder(
    folder: {
        uri: vscode.Uri,
        name?: string
    },
    fileToOpen: vscode.Uri
): Promise<boolean> {
    const disposables: vscode.Disposable[] = []

    // No-op if the folder is already in the workspace.
    if (vscode.workspace.getWorkspaceFolder(folder.uri)) {
        return false
    }

    let updateExistingWorkspacePromise: Promise<void> | undefined
    try {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            updateExistingWorkspacePromise = new Promise<void>((resolve, reject) => {
                try {
                    const watcher = vscode.workspace.createFileSystemWatcher(fileToOpen.fsPath)
                    const listener = (uri: vscode.Uri) => {
                        try {
                            if (path.relative(uri.fsPath, fileToOpen.fsPath)) {
                                resolve()
                                watcher.dispose()
                            }
                        } catch (err) {
                            reject(err)
                            watcher.dispose()
                        }
                    }

                    watcher.onDidCreate(listener)
                    watcher.onDidChange(listener)
                } catch (err) {
                    reject(err)
                }
            })
        }

        if (!vscode.workspace.updateWorkspaceFolders(
            // Add new folder to the end of the list rather than the beginning, to avoid VS Code
            // terminating and reinitializing our extension.
            (vscode.workspace.workspaceFolders || []).length,
            0,
            folder
        )) {
            console.error('Could not update workspace folders')
        }

        if (updateExistingWorkspacePromise) {
            await updateExistingWorkspacePromise
        }
    } finally {
        for (const disposable of disposables) {
            disposable.dispose()
        }
    }

    // Return true if the current process will be terminated by VS Code (because the first workspaceFolder was changed)
    return !updateExistingWorkspacePromise
}
