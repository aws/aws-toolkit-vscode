/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

interface LocationPromptOptions {
    /** Title of the prompt (default: 'Select a folder') */
    title?: string
    /** Optionally allow the user to select any directory, shown as a new item with specificed detail */
    browseFolderDetail?: string
    /** Removes the option to choose any folder */
    disableBrowseFolder?: boolean
    /** Extra buttons to add */
    buttons?: PrompterButtons<vscode.Uri>
}

// We only care about the name and URI of the folder
type Folder = Pick<vscode.WorkspaceFolder, 'name' | 'uri'>

/**
 * Creates a new prompt for a directory on the file-system.
 *
 * @param folders An array of {@link Folder} to display. The name is displayed as the Quick Pick label.
 * @param options Extra {@link LocationPromptOptions options}
 * @returns A {@link QuickPickPrompter Prompter} that returns a URI
 */
export function createFolderPrompt(
    folders: readonly Folder[] = [],
    options: LocationPromptOptions = {}
): QuickPickPrompter<vscode.Uri> {
    const items: DataQuickPickItem<vscode.Uri>[] = folders.map((f: Folder) => ({
        label: addCodiconToString('folder', f.name),
        data: f.uri,
    }))

    if (!options.disableBrowseFolder) {
        const browseLabel = addCodiconToString(
            'folder-opened',
            localize('AWS.location.select.folder', 'Select a folder...')
        )

        items.push(
            createBrowseFolderQuickPickItem(
                browseLabel,
                options.browseFolderDetail ?? '',
                folders.length > 0 ? folders[0].uri : undefined
            )
        )
    }

    return createQuickPick(items, {
        title: options.title ?? localize('AWS.location.prompt', 'Select a folder'),
        buttons: options.buttons,
    })
}
