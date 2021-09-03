/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { addCodiconToString } from '../../utilities/textUtilities'
import * as nls from 'vscode-nls'
import { WizardControl, WIZARD_RETRY } from '../../wizards/wizard'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { PrompterButtons } from '../buttons'

const localize = nls.loadMessageBundle()

interface Folder {
    readonly uri: vscode.Uri
    readonly name: string
}

class FolderQuickPickItem implements Omit<DataQuickPickItem<vscode.Uri>, 'disabled'> {
    public readonly label: string
    public readonly data: vscode.Uri

    public constructor(folder: Folder | vscode.WorkspaceFolder) {
        this.label = addCodiconToString('root-folder-opened', folder.name)
        this.data = folder.uri
    }
}

class BrowseFolderQuickPickItem implements Omit<DataQuickPickItem<vscode.Uri>, 'disabled'> {
    public alwaysShow: boolean = true

    public constructor(
        public readonly label: string,
        public readonly detail: string,
        private readonly defaultUri: vscode.Uri = vscode.Uri.file(os.homedir())
    ) {}

    public get data(): () => Promise<vscode.Uri | WizardControl> {
        return async () => {
            const result = await vscode.window.showOpenDialog({
                defaultUri: this.defaultUri,
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
    const items: DataQuickPickItem<vscode.Uri>[] = folders.map(
        (f: Folder | vscode.WorkspaceFolder) => new FolderQuickPickItem(f)
    )

    items.push(
        new BrowseFolderQuickPickItem(
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
