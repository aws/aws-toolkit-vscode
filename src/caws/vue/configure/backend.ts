/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ConnectedWorkspace, DevelopmentWorkspaceId, getDevfileLocation } from '../../model'
import { CawsCommands, WorkspaceSettings } from '../../commands'
import { VueWebview } from '../../../webviews/main'
import { Prompter } from '../../../shared/ui/prompter'
import { isValidResponse } from '../../../shared/wizards/wizard'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { GetStatusResponse } from '../../../shared/clients/developmentWorkspaceClient'
import { openCawsUrl } from '../../utils'
import { assertHasProps } from '../../../shared/utilities/tsUtils'
import {
    createAliasPrompter,
    createInstancePrompter,
    createTimeoutPrompter,
    getAllInstanceDescriptions,
} from '../../wizards/workspaceSettings'
import { updateDevfileCommand } from '../../devfile'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { isLongReconnect, removeReconnectionInformation, saveReconnectionInformation } from '../../reconnect'
import { DevelopmentWorkspace } from '../../../shared/clients/cawsClient'

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
        const location = await getDevfileLocation(this.workspace.workspaceClient)
        return vscode.workspace.asRelativePath(location)
    }

    public async openDevfile() {
        const location = await getDevfileLocation(this.workspace.workspaceClient)
        return this.commands.openDevfile.execute(location)
    }

    public async updateDevfile(location: string) {
        // TODO(sijaden): we should be able to store the absolute URI somewhere?
        const rootDirectory = vscode.workspace.workspaceFolders?.[0].uri
        if (!rootDirectory) {
            throw new Error('No workspace folder found')
        }

        await updateDevfileCommand.execute(vscode.Uri.joinPath(rootDirectory, location))
    }

    public async stopWorkspace(id: DevelopmentWorkspaceId) {
        return this.commands.stopWorkspace.execute(id)
    }

    public async deleteWorkspace(id: DevelopmentWorkspaceId) {
        return this.commands.deleteWorkspace.execute(id)
    }

    public async updateWorkspace(
        id: Pick<DevelopmentWorkspace, 'id' | 'org' | 'project' | 'alias'>,
        settings: WorkspaceSettings
    ) {
        if (isLongReconnect(this.workspace.summary, settings)) {
            try {
                await saveReconnectionInformation(id)
                await this.commands.updateWorkspace.execute(id, settings)
                reportClosingMessage()
            } catch (err) {
                await removeReconnectionInformation(id)
                throw err
            }
        } else {
            return this.commands.updateWorkspace.execute(id, settings)
        }
    }

    public async showLogsMessage(title: string): Promise<string | undefined> {
        return showViewLogsMessage(title)
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
                return prompt(createAliasPrompter())
            case 'instanceType':
                return prompt(createInstancePrompter())
            case 'inactivityTimeoutMinutes':
                return prompt(createTimeoutPrompter())
        }
    }

    public openBranch(): void {
        const repo = this.workspace.summary.repositories?.[0]
        assertHasProps(repo, 'branchName')
        openCawsUrl({
            type: 'branch',
            name: repo.branchName,
            repo: { name: repo.repositoryName },
            org: { name: this.workspace.summary.org.name },
            project: { name: this.workspace.summary.project.name },
        })
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
            const resp = await workspace.workspaceClient.getStatus()
            if (resp.status === 'CHANGED') {
                server.onDidChangeDevfile.fire({ ...resp, actionId: 'devfile' })
            }
            await sleep(2500)
        }
    })()

    return { dispose: () => (done = true) }
}

function reportClosingMessage(): void {
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'VSCode will now close this session. When the workspace is available again it will re-open',
        },
        async (progress, token) => {
            await sleep(2500)
            vscode.commands.executeCommand('workbench.action.remote.close')
        }
    )
}
