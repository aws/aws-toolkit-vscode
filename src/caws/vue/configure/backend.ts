/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import {
    createInstancePrompter,
    createTimeoutPrompter,
    getAllInstanceDescriptions,
} from '../../../mde/wizards/environmentSettings'
import { ConnectedWorkspace, DevEnvId, getDevfileLocation } from '../../model'
import { CawsCommands, WorkspaceSettings } from '../../commands'
import { VueWebview } from '../../../webviews/main'
import { Prompter } from '../../../shared/ui/prompter'
import { isValidResponse } from '../../../shared/wizards/wizard'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { GetStatusResponse } from '../../../shared/clients/mdeEnvironmentClient'
import { tryRestart } from '../../../mde/mdeCommands'
import { getCawsWorkspaceArn } from '../../../shared/vscode/env'

const localize = nls.loadMessageBundle()

export class CawsConfigureWebview extends VueWebview {
    public readonly id = 'configureCaws'
    public readonly source = 'src/caws/vue/configure/index.js'

    public readonly onDidChangeDevfile = new vscode.EventEmitter<GetStatusResponse>()

    public constructor(
        private readonly workspace: ConnectedWorkspace,
        private readonly commands: typeof CawsCommands.declared
    ) {
        super()
    }

    public init() {
        return this.workspace.summary
    }

    public getAllInstanceDescriptions() {
        return getAllInstanceDescriptions()
    }

    public async getDevFileLocation() {
        const location = await getDevfileLocation(this.workspace.environmentClient)
        return vscode.workspace.asRelativePath(location)
    }

    public async openDevfile() {
        const location = await getDevfileLocation(this.workspace.environmentClient)
        return this.commands.openDevFile.execute(location)
    }

    public async updateDevfile(location: string) {
        // XXX: add arn to the workspace model
        const arn = getCawsWorkspaceArn()

        if (!arn) {
            throw new Error('Expected workspace ARN to be defined')
        }

        const title = localize('AWS.caws.container.restart', 'Restarting container...')
        await vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, () =>
            tryRestart(arn, () => this.workspace.environmentClient.startDevfile({ location }))
        )
    }

    public async stopWorkspace(id: DevEnvId) {
        return this.commands.stopWorkspace.execute(id)
    }

    public async deleteWorkspace(id: DevEnvId) {
        return this.commands.deleteWorkspace.execute(id)
    }

    public async updateWorkspace(id: DevEnvId, settings: WorkspaceSettings) {
        return this.commands.updateWorkspace.execute(id, settings)
    }

    public async editSetting(settings: WorkspaceSettings, key: keyof WorkspaceSettings): Promise<WorkspaceSettings> {
        async function prompt(prompter: Prompter<any>) {
            prompter.recentItem = settings[key]
            const response = await prompter.prompt()

            if (isValidResponse(response)) {
                return { ...settings, [key]: response }
            } else {
                return settings
            }
        }

        switch (key) {
            case 'alias':
                throw new Error('Not Implemented')
            case 'instanceType':
                return prompt(createInstancePrompter())
            case 'inactivityTimeoutMinutes':
                return prompt(createTimeoutPrompter())
        }
    }
}

const Panel = VueWebview.compilePanel(CawsConfigureWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export async function showConfigureWorkspace(
    ctx: vscode.ExtensionContext,
    workspace: ConnectedWorkspace,
    commands: typeof CawsCommands.declared
): Promise<void> {
    activePanel ??= new Panel(ctx, workspace, commands)
    const webview = await activePanel.show({
        title: localize('AWS.view.configureWorkspace.title', 'Workspace Settings'),
        viewColumn: vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        const poller = pollDevfile(workspace, activePanel.server)
        subscriptions = [
            poller,
            webview.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}

function pollDevfile(workspace: ConnectedWorkspace, server: CawsConfigureWebview): vscode.Disposable {
    let done = false

    ;(async () => {
        while (!done) {
            const resp = await workspace.environmentClient.getStatus()
            if (resp.status === 'CHANGED') {
                server.onDidChangeDevfile.fire({ ...resp, actionId: 'devfile' })
            }
            await sleep(2500)
        }
    })()

    return { dispose: () => (done = true) }
}
