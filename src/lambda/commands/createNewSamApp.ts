/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { getSamCliContext, SamCliContext } from '../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import { throwAndNotifyIfInvalid } from '../../shared/sam/cli/samCliValidationUtils'
import { SamCliValidator } from '../../shared/sam/cli/samCliValidator'
import { ChannelLogger } from '../../shared/utilities/vsCodeUtils'
import { getMainSourceFileUri } from '../utilities/getMainSourceFile'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardResults,
    DefaultCreateNewSamAppWizardContext
} from '../wizards/samInitWizard'

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
    reason: string
    success: boolean
    runtime: string
}
/**
 * Runs `sam init` in the given context and returns useful metadata about its invocation
 */
export async function createNewSamApp(
    channelLogger: ChannelLogger,
    extensionContext: Pick<vscode.ExtensionContext, 'asAbsolutePath' | 'globalState'>,
    samCliContext: SamCliContext = getSamCliContext(),
): Promise<NewSamAppMetadata | undefined> {
    const resultsMetadata: NewSamAppMetadata = {
        reason: 'unknown',
        success: false,
        runtime: 'unknown',
    }

    try {
        await validateSamCli(samCliContext.validator)

        const wizardContext = new DefaultCreateNewSamAppWizardContext(extensionContext)
        const config: CreateNewSamAppWizardResults | undefined = await new CreateNewSamAppWizard(wizardContext).run()
        if (!config) {
            resultsMetadata.reason = 'cancelled'

            return resultsMetadata
        }

        resultsMetadata.runtime = config.runtime

        const initArguments: SamCliInitArgs = {
            name: config.name,
            location: config.location.fsPath,
            runtime: config.runtime,
        }
        await runSamCliInit(initArguments, samCliContext.invoker)

        resultsMetadata.success = true

        const uri = await getMainUri(config)
        if (!uri) {
            resultsMetadata.reason = 'startup file not found'

            return resultsMetadata
        }

        if (await addWorkspaceFolder(
            {
                uri: config.location,
                name: path.basename(config.location.fsPath)
            },
            uri
        )) {
            extensionContext.globalState.update(URI_TO_OPEN_ON_INIT_KEY, uri!.fsPath)
        } else {
            await vscode.window.showTextDocument(uri)
        }

        resultsMetadata.reason = 'complete'
    } catch (err) {
        channelLogger.channel.show(true)
        channelLogger.error(
            'AWS.samcli.initWizard.general.error',
            'An error occurred while creating a new SAM Application. Check the logs for more information.'
        )

        const error = err as Error
        channelLogger.logger.error(error)
        resultsMetadata.reason = error.message || 'error'
    }

    return resultsMetadata
}

async function validateSamCli(samCliValidator: SamCliValidator): Promise<void> {
    const validationResult = await samCliValidator.detectValidSamCli()
    throwAndNotifyIfInvalid(validationResult)
}

async function getMainUri(
    config: Pick<CreateNewSamAppWizardResults, 'location' | 'name'>
): Promise<vscode.Uri | undefined> {
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
