/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { addCodiconToString } from '../utilities/textUtilities'
import { DataQuickPickItem, createPrompter, Prompter, ButtonBinds } from './prompter'
import * as nls from 'vscode-nls'
import { WIZARD_RETRY } from '../wizards/wizard'

const localize = nls.loadMessageBundle()

export interface Folder {
    readonly uri: vscode.Uri
    readonly name: string
}

export class FolderQuickPickItem implements DataQuickPickItem<vscode.Uri> {
    public readonly label: string

    public constructor(private readonly folder: Folder | vscode.WorkspaceFolder) {
        this.label = addCodiconToString('root-folder-opened', folder.name)
    }

    public get data(): vscode.Uri {
        return this.folder.uri
    }
}

export class BrowseFolderQuickPickItem implements DataQuickPickItem<vscode.Uri> {
    public alwaysShow: boolean = true

    public constructor(
        public readonly label: string, 
        public readonly detail: string,
        private readonly defaultUri: vscode.Uri = vscode.Uri.file(os.homedir())
    ) {}

    public get data(): () => Promise<vscode.Uri | symbol> {
        return async () => {
            const result = await vscode.window.showOpenDialog({
                defaultUri: this.defaultUri,
                openLabel: localize('AWS.samcli.initWizard.name.browse.openLabel', 'Open'),
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

 export function createLocationPrompt(
    folders: Folder[] | readonly vscode.WorkspaceFolder[] = [],
    buttonBinds?: ButtonBinds,
    overrideText?: {
        detail?: string,
        title?: string,
    }
): Prompter<vscode.Uri> {
    const browseLabel = 
        (folders.length > 0) ?
        addCodiconToString(
            'folder-opened',
            localize('AWS.initWizard.location.select.folder', 'Select a different folder...')
        ) 
        : localize(
            'AWS.initWizard.location.select.folder.empty.workspace',
            'There are no workspace folders open. Select a folder...'
        )
    const items: DataQuickPickItem<vscode.Uri>[] = folders.map(
        (f: Folder | vscode.WorkspaceFolder) => new FolderQuickPickItem(f))
        
    items.push(
            new BrowseFolderQuickPickItem(
                browseLabel,
                overrideText?.detail ?? localize(
                    'AWS.wizard.location.select.folder.detail',
                    'The selected folder will be added to the workspace.'
                ),
                folders.length > 0 ? folders[0].uri : undefined,
            )
    )

    return createPrompter(items, { 
        ignoreFocusOut: true, 
        title: overrideText?.title ?? localize('AWS.wizard.location.prompt', 'Select a workspace folder for your new project'),
        buttonBinds: buttonBinds,
    })
}