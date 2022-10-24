/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as path from 'path'
import { DevelopmentWorkspaceClient } from '../shared/clients/developmentWorkspaceClient'
import { DevfileRegistry, DEVFILE_GLOB_PATTERN } from '../shared/fs/devfileRegistry'
import { getLogger } from '../shared/logger'
import { Commands } from '../shared/vscode/commands2'
import { checkUnsavedChanges } from '../shared/utilities/workspaceUtils'
import { ToolkitError } from '../shared/errors'

async function updateDevfile(uri: vscode.Uri): Promise<void> {
    const client = new DevelopmentWorkspaceClient()
    if (!client.isCodeCatalystWorkspace()) {
        throw new Error('Cannot update devfile while outside a development environment')
    }

    // XXX: hard-coded `projects` path, waiting for Code Catalyst to provide an environment variable
    // could also just parse the devfile...
    const location = path.relative('/projects', uri.fsPath)

    const title = localize('AWS.codecatalyst.container.restart', 'Restarting workspace container...')
    await vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, async () => {
        if (checkUnsavedChanges()) {
            // TODO: show confirmation prompt instead
            throw new ToolkitError('Cannot update devfile with unsaved changes in the workspace')
        }

        try {
            await client.startDevfile({ location })
        } catch (err) {
            throw ToolkitError.chain(err, 'Failed to update devfile')
        }
    })
    // if we get here, no restart happened :(
    // TODO: accurate telemetry is hard to capture here
}

export const updateDevfileCommand = Commands.register(
    {
        id: 'aws.codecatalyst.updateDevfile',
        telemetryName: 'codecatalyst_updateDevfile',
    },
    updateDevfile
)

type Workspace = Pick<typeof vscode.workspace, 'onDidSaveTextDocument'>

export class DevfileCodeLensProvider implements vscode.CodeLensProvider {
    private canUpdate = false
    private readonly disposables: vscode.Disposable[] = []
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

    public constructor(
        registry: DevfileRegistry,
        private readonly client = new DevelopmentWorkspaceClient(),
        workspace: Workspace = vscode.workspace
    ) {
        this.disposables.push(this._onDidChangeCodeLenses)
        this.disposables.push(
            workspace.onDidSaveTextDocument(async document => {
                if (!registry.getRegisteredItem(document.fileName)) {
                    return
                }

                await this.handleUpdate(document).catch(err => {
                    getLogger().debug(`REMOVED.codes: devfile codelens failure: ${err?.message}`)
                })
            })
        )
    }

    public async handleUpdate(document: vscode.TextDocument) {
        const response = await this.client.getStatus()

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

        // TODO: handle both create and update case based on current context
        // also make the positions better
        const range = new vscode.Range(0, 0, 0, 0)
        const lens = updateDevfileCommand.build(document.uri).asCodeLens(range, {
            title: localize('AWS.codecatalyst.codelens.updateWorkspace', 'Update Workspace'),
        })

        return [lens]
    }

    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

export function registerDevfileWatcher(workspaceClient: DevelopmentWorkspaceClient): vscode.Disposable {
    const registry = new DevfileRegistry()
    const codelensProvider = new DevfileCodeLensProvider(registry, workspaceClient)
    registry.addWatchPattern(DEVFILE_GLOB_PATTERN)

    const codelensDisposable = vscode.languages.registerCodeLensProvider(
        {
            language: 'yaml',
            scheme: 'file',
            pattern: DEVFILE_GLOB_PATTERN,
        },
        codelensProvider
    )

    return vscode.Disposable.from(codelensDisposable, codelensProvider, registry)
}
