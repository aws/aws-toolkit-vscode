/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DevfileRegistry } from '../shared/fs/devfileRegistry'
import { DefaultMdeEnvironmentClient, MdeEnvironmentClient } from '../shared/clients/mdeEnvironmentClient'
import { getLogger } from '../shared/logger/logger'
import { UPDATE_DEVFILE_COMMAND } from './mdeCommands'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

type Workspace = Pick<typeof vscode.workspace, 'onDidSaveTextDocument'>

export class MdeDevfileCodeLensProvider implements vscode.CodeLensProvider {
    private canUpdate = false
    private readonly disposables: vscode.Disposable[] = []
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

    public constructor(
        registry: DevfileRegistry,
        private readonly client: MdeEnvironmentClient = new DefaultMdeEnvironmentClient(),
        workspace: Workspace = vscode.workspace
    ) {
        this.disposables.push(this._onDidChangeCodeLenses)
        this.disposables.push(
            workspace.onDidSaveTextDocument(async document => {
                if (!registry.getRegisteredItem(document.fileName)) {
                    return
                }

                await this.handleUpdate(document).catch(err => {
                    getLogger().debug('mde: devfile codelens failure: %O', err)
                })
            })
        )
    }

    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }

    public async handleUpdate(document: vscode.TextDocument) {
        const response = await this.client.getStatus()
        getLogger().debug(`mde: env status: ${JSON.stringify(response)}`)

        this.canUpdate = response.status === 'CHANGED'
        this._onDidChangeCodeLenses.fire()
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        if (!this.canUpdate || document.uri.scheme !== 'file') {
            return
        }

        return [
            {
                // TODO: handle both create and update case based on current context
                // also make the positions better
                range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
                isResolved: true,
                command: this.createCommand(document),
            },
        ]
    }

    private createCommand(document: vscode.TextDocument) {
        interface Command {
            readonly title: string
            readonly command: string
            readonly arguments: Parameters<typeof UPDATE_DEVFILE_COMMAND[1]>
        }

        const command: Command = {
            title: localize('AWS.mde.codeLens.updateEnvironment', 'Update Environment'),
            command: UPDATE_DEVFILE_COMMAND[0],
            arguments: [document.uri],
        }

        return command
    }
}
