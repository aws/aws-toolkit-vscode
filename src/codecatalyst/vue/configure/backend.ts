/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ConnectedWorkspace, DevEnvironmentId, getDevfileLocation } from '../../model'
import { CodeCatalystCommands, DevEnvironmentSettings } from '../../commands'
import { VueWebview } from '../../../webviews/main'
import { Prompter } from '../../../shared/ui/prompter'
import { isValidResponse } from '../../../shared/wizards/wizard'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { GetStatusResponse } from '../../../shared/clients/developmentWorkspaceClient'
import { openCodeCatalystUrl } from '../../utils'
import { assertHasProps } from '../../../shared/utilities/tsUtils'
import {
    createAliasPrompter,
    createInstancePrompter,
    createTimeoutPrompter,
    getAllInstanceDescriptions,
    isValidSubscriptionType,
} from '../../wizards/workspaceSettings'
import { updateDevfileCommand } from '../../devfile'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { isLongReconnect, removeReconnectionInformation, saveReconnectionInformation } from '../../reconnect'
import { ConnectedCodeCatalystClient, DevEnvironment } from '../../../shared/clients/codeCatalystClient'
import { isCloud9 } from '../../../shared/extensionUtilities'

const localize = nls.loadMessageBundle()

export class CodeCatalystConfigureWebview extends VueWebview {
    public readonly id = 'configureCodeCatalyst'
    public readonly source = 'src/codecatalyst/vue/configure/index.js'

    public readonly onDidChangeDevfile = new vscode.EventEmitter<GetStatusResponse>()

    public constructor(
        private readonly client: ConnectedCodeCatalystClient,
        private readonly workspace: ConnectedWorkspace,
        private readonly commands: typeof CodeCatalystCommands.declared
    ) {
        super()
    }

    public init() {
        return this.workspace.summary
    }

    public getAllInstanceDescriptions() {
        return getAllInstanceDescriptions()
    }

    public async getDevfileLocation() {
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

    public async stopWorkspace(id: DevEnvironmentId) {
        return this.commands.stopWorkspace.execute(id)
    }

    public async deleteWorkspace(id: DevEnvironmentId) {
        return this.commands.deleteWorkspace.execute(id)
    }

    public async updateWorkspace(
        id: Pick<DevEnvironment, 'id' | 'org' | 'project' | 'alias'>,
        settings: DevEnvironmentSettings
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

    public async editSetting(
        settings: DevEnvironmentSettings,
        key: keyof DevEnvironmentSettings
    ): Promise<DevEnvironmentSettings> {
        const organizationName = this.workspace.summary.org.name
        const subscriptionType = await this.client
            .describeSubscription({ organizationName })
            .then(resp => (isValidSubscriptionType(resp.subscriptionType) ? resp.subscriptionType : 'FREE'))

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
                return prompt(createInstancePrompter(subscriptionType))
            case 'inactivityTimeoutMinutes':
                return prompt(createTimeoutPrompter())
            case 'persistentStorage':
                throw new Error('Persistent storage cannot be changed after creation')
        }
    }

    public openBranch(): void {
        const repo = this.workspace.summary.repositories?.[0]
        assertHasProps(repo, 'branchName')
        openCodeCatalystUrl({
            type: 'branch',
            name: repo.branchName,
            repo: { name: repo.repositoryName },
            org: { name: this.workspace.summary.org.name },
            project: { name: this.workspace.summary.project.name },
        })
    }
}

const Panel = VueWebview.compilePanel(CodeCatalystConfigureWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export async function showConfigureWorkspace(
    client: ConnectedCodeCatalystClient,
    ctx: vscode.ExtensionContext,
    workspace: ConnectedWorkspace,
    commands: typeof CodeCatalystCommands.declared
): Promise<void> {
    activePanel ??= new Panel(ctx, client, workspace, commands)
    const webview = await activePanel.show({
        title: localize('AWS.view.configureWorkspace.title', 'Workspace Settings'),
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
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

function pollDevfile(workspace: ConnectedWorkspace, server: CodeCatalystConfigureWebview): vscode.Disposable {
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
            title: 'Session ended. Session will restore when the workspace is available again.',
        },
        async (progress, token) => {
            await sleep(2500)
            vscode.commands.executeCommand('workbench.action.remote.close')
        }
    )
}
