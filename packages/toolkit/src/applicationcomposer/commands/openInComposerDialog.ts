import { Commands } from '../../shared/vscode/commands2'
import { ApplicationComposerManager } from '../webviewManager'
import vscode from 'vscode'

export const openInComposerDialogCommand = Commands.declare(
    'aws.openInApplicationComposerDialog',
    (manager: ApplicationComposerManager) => async () => {
        const fileUri = await vscode.window.showOpenDialog({
            filters: {
                Templates: ['yml', 'yaml', 'json', 'template'],
            },
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
        })
        if (fileUri && fileUri[0]) {
            return await manager.visualizeTemplate(fileUri[0])
        }
    }
)
