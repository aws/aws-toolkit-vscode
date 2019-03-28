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

export const URI_TO_OPEN_ON_INIT_KEY = 'URI_TO_OPEN_ON_INIT_KEY'

export async function resumeCreateNewSamApp(context: Pick<vscode.ExtensionContext, 'globalState'>) {
    const rawUri = context.globalState.get<string>(URI_TO_OPEN_ON_INIT_KEY)
    if (!rawUri) {
        return
    }

    try {
        const uri = vscode.Uri.file(rawUri)
        if (!vscode.workspace.getWorkspaceFolder(uri)) {
            // This should never happen, as `rawUri` will only be set if `uri` is in the newly added workspace folder.
            vscode.window.showErrorMessage(localize(
                'AWS.samcli.initWizard.source.error.notInWorkspace',
                'Could not open file \'{0}\'. If this file exists on disk, try adding it to your workspace.',
                uri.fsPath
            ))

            return
        }

        await vscode.window.showTextDocument(uri)
    } finally {
        context.globalState.update(URI_TO_OPEN_ON_INIT_KEY, undefined)
    }
}

interface NewSamAppMetadata {
    runtime: string
}
/**
 * Runs `sam init` in the given context and returns useful metadata about its invocation
 */
export async function createNewSamApp(
    context: Pick<vscode.ExtensionContext, 'globalState'>
): Promise<NewSamAppMetadata | undefined> {
    const config = await new CreateNewSamAppWizard().run()
    if (!config) {
        return undefined
    }

    const invocation = new SamCliInitInvocation(config)
    await invocation.execute()

    const uri = await getMainUri(config)
    if (!uri) {
        return undefined
    }

    if (await addWorkspaceFolder(
        {
            uri: config.location,
            name: path.basename(config.location.fsPath)
        },
        uri
    )) {
        context.globalState.update(URI_TO_OPEN_ON_INIT_KEY, uri!.fsPath)
    } else {
        await vscode.window.showTextDocument(uri)
    }

    return {
        runtime: config.runtime
    }
}

async function getMainUri(config: Pick<SamCliInitArgs, 'location' | 'name'>): Promise<vscode.Uri | undefined> {
    try {
        return await getMainSourceFileUri({
            root: vscode.Uri.file(path.join(config.location.fsPath, config.name))
        })
    } catch (err) {
        vscode.window.showWarningMessage(localize(
            'AWS.samcli.initWizard.source.error.notFound',
            'Project created successfully, but main source code file not found: {0}',
            err
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
                    disposables.push(watcher)

                    const listener = (uri: vscode.Uri) => {
                        try {
                            if (path.relative(uri.fsPath, fileToOpen.fsPath)) {
                                resolve()
                            }
                        } catch (err) {
                            reject(err)
                        }
                    }

                    watcher.onDidCreate(listener, undefined, disposables)
                    watcher.onDidChange(listener, undefined, disposables)
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

            return false
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
