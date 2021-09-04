/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { addCodiconToString } from '../../utilities/textUtilities'
import * as nls from 'vscode-nls'
import { WIZARD_RETRY } from '../../wizards/wizard'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { PrompterButtons } from '../buttons'

const localize = nls.loadMessageBundle()

interface Folder {
    readonly uri: vscode.Uri
    readonly name: string
}

function createBrowseFolderQuickPickItem(
    label: string,
    detail: string,
    defaultUri: vscode.Uri = vscode.Uri.file(os.homedir())
): DataQuickPickItem<vscode.Uri> {
    const openFileDialog = async () => {
        const result = await vscode.window.showOpenDialog({
            defaultUri: defaultUri,
            openLabel: localize('AWS.generic.open', 'Open'),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        })

        if (!result || !result.length) {
            return WIZARD_RETRY
        }

        return result[0]
    }

    return {
        label,
        detail,
        alwaysShow: true,
        skipEstimate: true,
        data: openFileDialog,
    }
}

interface LocationPrompterOptions {
    title?: string
    buttons?: PrompterButtons<vscode.Uri>
    newFolderDetail?: string
}

export function createLocationPrompt(
    folders: Folder[] | readonly vscode.WorkspaceFolder[] = [],
    options: LocationPrompterOptions = {}
): QuickPickPrompter<vscode.Uri> {
    const browseLabel =
        folders.length > 0
            ? addCodiconToString(
                  'folder-opened',
                  localize('AWS.location.select.folder', 'Select a different folder...')
              )
            : localize(
                  'AWS.location.select.folder.empty.workspace',
                  'There are no workspace folders open. Select a folder...'
              )
    const items: DataQuickPickItem<vscode.Uri>[] = folders.map((f: Folder | vscode.WorkspaceFolder) => ({
        label: addCodiconToString('root-folder-opened', f.name),
        data: f.uri,
    }))

    items.push(
        createBrowseFolderQuickPickItem(
            browseLabel,
            options.newFolderDetail ??
                localize('AWS.location.select.folder.detail', 'The selected folder will be added to the workspace.'),
            folders.length > 0 ? folders[0].uri : undefined
        )
    )

    return createQuickPick(items, {
        title: options.title ?? localize('AWS.location.prompt', 'Select a workspace folder for your new project'),
        buttons: options.buttons,
    })
}
