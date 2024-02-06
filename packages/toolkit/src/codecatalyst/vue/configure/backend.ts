/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ConnectedDevEnv, DevEnvironmentId, getDevfileLocation } from '../../model'
import { CodeCatalystCommands, DevEnvironmentSettings } from '../../commands'
import { VueWebview } from '../../../webviews/main'
import { Prompter } from '../../../shared/ui/prompter'
import { isValidResponse } from '../../../shared/wizards/wizard'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { GetStatusResponse } from '../../../shared/clients/devenvClient'
import { openCodeCatalystUrl } from '../../utils'
import { assertHasProps } from '../../../shared/utilities/tsUtils'
import {
    createAliasPrompter,
    createInstancePrompter,
    createTimeoutPrompter,
    getAllInstanceDescriptions,
    isValidSubscriptionType,
} from '../../wizards/devenvSettings'
import { updateDevfileCommand } from '../../devfile'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { isLongReconnect, removeReconnectionInformation, saveReconnectionInformation } from '../../reconnect'
import { CodeCatalystClient, DevEnvironment } from '../../../shared/clients/codecatalystClient'
import { isCloud9 } from '../../../shared/extensionUtilities'

const localize = nls.loadMessageBundle()

export class CodeCatalystConfigureWebview extends VueWebview {
    public readonly id = 'configureCodeCatalyst'
    public readonly source = 'src/codecatalyst/vue/configure/index.js'

    public readonly onDidChangeDevfile = new vscode.EventEmitter<GetStatusResponse>()

    public constructor(
        private readonly client: CodeCatalystClient,
        private readonly devenv: ConnectedDevEnv,
        private readonly commands: typeof CodeCatalystCommands.declared
    ) {
        super()
    }

    public init() {
        return this.devenv.summary
    }

    public getAllInstanceDescriptions() {
        return getAllInstanceDescriptions()
    }

    public async getDevfileLocation() {
        const location = await getDevfileLocation(this.devenv.devenvClient)
        return vscode.workspace.asRelativePath(location)
    }

    public async openDevfile() {
        const location = await getDevfileLocation(this.devenv.devenvClient)
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

    public async stopDevEnv(id: DevEnvironmentId) {
        return this.commands.stopDevEnv.execute(id)
    }

    public async deleteDevEnv(id: DevEnvironmentId) {
        return this.commands.deleteDevEnv.execute(id)
    }

    public async updateDevEnv(
        id: Pick<DevEnvironment, 'id' | 'org' | 'project' | 'alias'>,
        settings: DevEnvironmentSettings
    ) {
        if (isLongReconnect(this.devenv.summary, settings)) {
            try {
                await saveReconnectionInformation(id)
                const resp = await this.commands.updateDevEnv.execute(id, settings)
                if (resp === undefined) {
                    await removeReconnectionInformation(id)
                } else {
                    reportClosingMessage()
                }

                return resp
            } catch (err) {
                await removeReconnectionInformation(id)
                throw err
            }
        } else {
            return this.commands.updateDevEnv.execute(id, settings)
        }
    }

    public async showLogsMessage(title: string): Promise<string | undefined> {
        return showViewLogsMessage(title)
    }

    public async editSetting(
        settings: DevEnvironmentSettings,
        key: keyof DevEnvironmentSettings
    ): Promise<DevEnvironmentSettings> {
        const spaceName = this.devenv.summary.org.name
        const subscriptionType = await this.client
            .getSubscription({ spaceName })
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
        const repo = this.devenv.summary.repositories?.[0]
        assertHasProps(repo, 'branchName')
        openCodeCatalystUrl({
            type: 'branch',
            name: repo.branchName,
            repo: { name: repo.repositoryName },
            org: { name: this.devenv.summary.org.name },
            project: { name: this.devenv.summary.project.name },
        })
    }
}

const Panel = VueWebview.compilePanel(CodeCatalystConfigureWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export async function showConfigureDevEnv(
    client: CodeCatalystClient,
    ctx: vscode.ExtensionContext,
    devenv: ConnectedDevEnv,
    commands: typeof CodeCatalystCommands.declared
): Promise<void> {
    activePanel ??= new Panel(ctx, client, devenv, commands)
    const webview = await activePanel.show({
        title: localize('AWS.view.configureDevEnv.title', 'Dev Environment Settings'),
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        const poller = pollDevfile(devenv, activePanel.server)
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

function pollDevfile(devenv: ConnectedDevEnv, server: CodeCatalystConfigureWebview): vscode.Disposable {
    let done = false

    void (async () => {
        while (!done) {
            const resp = await devenv.devenvClient.getStatus()
            if (resp.status === 'CHANGED') {
                server.onDidChangeDevfile.fire({ ...resp, actionId: 'devfile' })
            }
            await sleep(2500)
        }
    })()

    return { dispose: () => (done = true) }
}

function reportClosingMessage(): void {
    void vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Session ended. Session will restore when the Dev Environment is available again.',
        },
        async (progress, token) => {
            await sleep(2500)
            await vscode.commands.executeCommand('workbench.action.remote.close')
        }
    )
}
