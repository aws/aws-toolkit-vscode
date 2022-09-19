/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CawsCommands, WorkspaceSettings } from '../../commands'
import { VueWebview } from '../../../webviews/main'
import { Prompter } from '../../../shared/ui/prompter'
import { isValidResponse } from '../../../shared/wizards/wizard'
import {
    createAliasPrompter,
    createInstancePrompter,
    createStoragePrompter,
    createTimeoutPrompter,
    getAllInstanceDescriptions,
    isValidSubscriptionType,
} from '../../wizards/workspaceSettings'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import {
    CawsBranch,
    CawsOrg,
    CawsProject,
    ConnectedCawsClient,
    DevelopmentWorkspace,
} from '../../../shared/clients/cawsClient'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { isNonNullable } from '../../../shared/utilities/tsUtils'

interface LinkedResponse {
    readonly type: 'linked'
    readonly selectedProject: CawsProject
    readonly selectedBranch: CawsBranch
    readonly newBranch: string
}

interface EmptyResponse {
    readonly type: 'none'
    readonly selectedProject: CawsProject
}

export type SourceResponse = LinkedResponse | EmptyResponse

export class CawsCreateWebview extends VueWebview {
    public readonly id = 'createCaws'
    public readonly source = 'src/caws/vue/create/index.js'

    public constructor(
        private readonly client: ConnectedCawsClient,
        private readonly commands: typeof CawsCommands.declared,
        private readonly onComplete: (workspace?: DevelopmentWorkspace) => void
    ) {
        super()
    }

    public close() {
        this.dispose()
        this.onComplete()
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

    public async editSetting(
        settings: WorkspaceSettings,
        key: keyof WorkspaceSettings,
        org?: Pick<CawsOrg, 'name'>
    ): Promise<WorkspaceSettings> {
        const subscriptionType = isNonNullable(org)
            ? await this.client
                  .describeSubscription({ organizationName: org.name })
                  .then(resp => (isValidSubscriptionType(resp.subscriptionType) ? resp.subscriptionType : 'FREE'))
            : 'FREE'

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
                return prompt(createStoragePrompter(subscriptionType))
        }
    }

    public async submit(settings: WorkspaceSettings, source: SourceResponse) {
        const workspace: DevelopmentWorkspace = await (() => {
            switch (source.type) {
                case 'none':
                    return this.createEmptyWorkpace(settings, source)
                case 'linked':
                    return this.createLinkedWorkspace(settings, source)
            }
        })()

        telemetry.caws_connect.record({ source: 'Webview' })
        telemetry.caws_createWorkspace.record({ caws_createWorkspaceRepoType: source.type })

        this.onComplete(workspace)
        this.commands.openWorkspace.execute(workspace)
    }

    private async createEmptyWorkpace(settings: WorkspaceSettings, source: EmptyResponse) {
        return this.client.createDevelopmentWorkspace({
            ides: [{ name: 'VSCode' }],
            projectName: source.selectedProject.name,
            organizationName: source.selectedProject.org.name,
            ...settings,
        })
    }

    private async createLinkedWorkspace(settings: WorkspaceSettings, source: LinkedResponse) {
        const isNewBranch = !!source.newBranch
        if (isNewBranch) {
            await this.client.createSourceBranch({
                branchName: source.newBranch,
                organizationName: source.selectedProject.org.name,
                projectName: source.selectedProject.name,
                sourceRepositoryName: source.selectedBranch.repo.name,
                commitSpecifier: source.selectedBranch.headCommitId,
            })
        }

        const branchName = isNewBranch ? source.newBranch : source.selectedBranch.name.replace('refs/heads/', '')
        return this.client.createDevelopmentWorkspace({
            ides: [{ name: 'VSCode' }],
            projectName: source.selectedProject.name,
            organizationName: source.selectedProject.org.name,
            repositories: [
                {
                    repositoryName: source.selectedBranch.repo.name,
                    branchName,
                },
            ],
            ...settings,
        })
    }
}

// TODO(sijaden): de-dupe this basic init pattern for webviews
// the logic here is mainly to preserve the same panel in case the
// user re-runs a command, which is fairly common
const Panel = VueWebview.compilePanel(CawsCreateWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined
let submitPromise: Promise<void> | undefined

export async function showCreateWorkspace(
    client: ConnectedCawsClient,
    ctx: vscode.ExtensionContext,
    commands: typeof CawsCommands.declared
): Promise<void> {
    submitPromise ??= new Promise<void>((resolve, reject) => {
        activePanel ??= new Panel(ctx, client, commands, workspace => {
            if (workspace === undefined) {
                reject(new CancellationError('user'))
            } else {
                resolve()
            }
        })
    })

    const webview = await activePanel!.show({
        title: localize('AWS.view.createWorkspace.title', 'Create a REMOVED.codes Workspace'),
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
                submitPromise = undefined
            }),
        ]
    }

    return submitPromise
}
