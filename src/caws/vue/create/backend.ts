/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { WorkspaceSettings } from '../../commands'
import { VueWebview } from '../../../webviews/main'
import { Prompter } from '../../../shared/ui/prompter'
import { isValidResponse } from '../../../shared/wizards/wizard'
import { GetStatusResponse } from '../../../shared/clients/developmentWorkspaceClient'
import {
    createAliasPrompter,
    createInstancePrompter,
    createTimeoutPrompter,
    getAllInstanceDescriptions,
} from '../../wizards/workspaceSettings'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { CawsBranch, CawsProject, ConnectedCawsClient } from '../../../shared/clients/cawsClient'

const localize = nls.loadMessageBundle()

export class CawsCreateWebview extends VueWebview {
    public readonly id = 'createCaws'
    public readonly source = 'src/caws/vue/create/index.js'

    public readonly onDidChangeDevfile = new vscode.EventEmitter<GetStatusResponse>()

    public constructor(private readonly client: ConnectedCawsClient) {
        super()
    }

    public async getProjects() {
        return this.client.listResources('project').flatten().promise()
    }

    public async getBranches(project: CawsProject) {
        const repos = this.client
            .listSourceRepositories({
                organizationName: project.org.name,
                projectName: project.name,
            })
            .flatten()

        const branches = repos.map(r =>
            this.client
                .listBranches({
                    organizationName: r.org.name,
                    projectName: r.project.name,
                    sourceRepositoryName: r.name,
                })
                .flatten()
                .promise()
        )

        return branches.flatten().promise()
    }

    public getAllInstanceDescriptions() {
        return getAllInstanceDescriptions()
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

    public async submit(settings: WorkspaceSettings, project: CawsProject, branch: CawsBranch) {
        await this.client.createDevelopmentWorkspace({
            organizationName: project.org.name,
            projectName: project.name,
            repositories: [
                {
                    repositoryName: branch.repo.name,
                    branchName: branch.name,
                },
            ],
            ides: [
                {
                    name: 'VSCode',
                },
            ],
            ...settings,
        })
    }

    public close() {
        this.dispose()
    }
}

const Panel = VueWebview.compilePanel(CawsCreateWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export async function showCreateWorkspace(ctx: vscode.ExtensionContext, client: ConnectedCawsClient): Promise<void> {
    activePanel ??= new Panel(ctx, client)
    const webview = await activePanel.show({
        title: localize('AWS.view.createWorkspace.title', 'Create a REMOVED.codes Workspace'),
        viewColumn: vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}
