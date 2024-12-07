/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { Commands } from '../../shared/vscode/commands2'
import vscode from 'vscode'
import { ThreatComposerEditorProvider } from '../threatComposerEditorProvider'
import fs from '../../shared/fs/fs'

/**
 * This is a helper function to create a new Threat Composer file.
 * It first checks if a workspace has been opened, as we would need a workspace to save the file.
 * User is then prompted for a file name that is saved in the workspace as <name>.tc.json.
 * The new file is then opened in a Threat Composer view.
 */
const createNewThreatComposerFile = async () => {
    if (vscode.workspace.workspaceFolders) {
        const rootFolder = vscode.workspace.workspaceFolders[0].uri.fsPath

        const title = await vscode.window.showInputBox({
            prompt: 'Enter name for file',
            validateInput: async (text) => {
                if (text && (await fs.existsFile(path.join(rootFolder, `${text}.tc.json`)))) {
                    return 'The specified file already exists'
                }
            },
        })

        if (!title) {
            return
        }

        const fileContent = '' // Empty content would be accepted by TC which will save default structure automatically
        const filePath = path.join(rootFolder, `${title}.tc.json`)
        await fs.writeFile(filePath, fileContent)

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(filePath),
            ThreatComposerEditorProvider.viewType
        )
    } else {
        void vscode.window.showErrorMessage('Workspace folder not defined')
    }
}

/**
 * Command to Create a new Threat Composer File through the command pallet.
 * The only difference with `NewThreatComposerFile` is in the text that is displayed
 */
export const CreateNewThreatComposer = Commands.declare(
    'aws.createNewThreatComposer',
    () => createNewThreatComposerFile
)

/**
 * Command to Create a new Threat Composer File through the New File option.
 * The only difference with `CreateNewThreatComposer` is in the text that is displayed
 */
export const NewThreatComposerFile = Commands.declare('aws.newThreatComposerFile', () => createNewThreatComposerFile)
