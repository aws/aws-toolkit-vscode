/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { Commands } from '../../shared/vscode/commands2'
import vscode from 'vscode'
import { ThreatComposerEditorProvider } from '../editorWebviewManager'
import { fsCommon } from '../../srcShared/fs'

const createNewThreatComposerFile = async () => {
    if (vscode.workspace.workspaceFolders) {
        const rootFolder = vscode.workspace.workspaceFolders[0].uri.fsPath

        const title = await vscode.window.showInputBox({
            prompt: 'Enter name for file',
            validateInput: async text => {
                if (text && (await fsCommon.existsFile(path.join(rootFolder, text + '.tc.json')))) {
                    return 'The specified file already exists'
                }
            },
        })

        if (!title) {
            return
        }

        const fileContent = '' //Empty content would be accepted by TC which will save default structure automatically
        const filePath = path.join(rootFolder, title + '.tc.json')
        await fsCommon.writeFile(filePath, fileContent)

        await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(filePath),
            ThreatComposerEditorProvider.viewType
        )
    } else {
        void vscode.window.showErrorMessage('Workspace folder not defined')
    }
}

export const CreateNewThreatComposer = Commands.declare(
    'aws.createNewThreatComposer',
    () => createNewThreatComposerFile
)
export const NewThreatComposerFile = Commands.declare('aws.newThreatComposerFile', () => createNewThreatComposerFile)
