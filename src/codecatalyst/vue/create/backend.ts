/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CodeCatalystCommands, DevEnvironmentSettings } from '../../commands'
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
} from '../../wizards/devenvSettings'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import {
    CodeCatalystBranch,
    CodeCatalystOrg,
    CodeCatalystProject,
    CodeCatalystClient,
    DevEnvironment,
} from '../../../shared/clients/codecatalystClient'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { isNonNullable } from '../../../shared/utilities/tsUtils'
import { recordSource } from '../../utils'
import { QuickPickPrompter } from '../../../shared/ui/pickerPrompter'
import { createProjectPrompter } from '../../wizards/selectResource'

interface LinkedResponse {
    readonly type: 'linked'
    readonly selectedProject: CodeCatalystProject
    readonly selectedBranch: CodeCatalystBranch
    readonly newBranch: string
}

interface EmptyResponse {
    readonly type: 'none'
    readonly selectedProject: CodeCatalystProject
}

export type SourceResponse = LinkedResponse | EmptyResponse

export class CodeCatalystCreateWebview extends VueWebview {
    private projectPrompter?: QuickPickPrompter<CodeCatalystProject>

    public readonly id = 'createCodeCatalyst'
    public readonly source = 'src/codecatalyst/vue/create/index.js'

    public constructor(
        private readonly client: CodeCatalystClient,
        private readonly commands: typeof CodeCatalystCommands.declared,
        private readonly onComplete: (devenv?: DevEnvironment) => void
    ) {
        super()

        // When webview first loads, an instance of this class
        // is created.
        // We build the prompter here since it immeditely starts
        // fetching the Projects upon creation.
        // When a user triggers the prompt to select a Project the **first** time,
        // the fetching of Projects will already be in progress.
        this.projectPrompter = createProjectPrompter(this.client)
    }

    public close() {
        this.dispose()
        this.onComplete()
    }

    /**
     * Opens a quick pick that lists all Projects from all Spaces.
     *
     * @param spaceName Only show Projects from this Space in the quick pick. If undefined,
     *                  shows Projects from all Spaces.
     * @returns Project if it was selected, otherwise undefined due to user cancellation.
     */
    public async quickPickProject(spaceName?: CodeCatalystOrg['name']): Promise<CodeCatalystProject | undefined> {
        // We use an existing prompter since it would have already started
        // fetching Projects (improved UX).
        if (this.projectPrompter === undefined) {
            this.projectPrompter = createProjectPrompter(this.client, spaceName)
        }

        const selectedProject = await this.projectPrompter.prompt()
        this.projectPrompter = undefined

        if (!isValidResponse(selectedProject)) {
            return
        }

        return selectedProject
    }

    public async getBranches(project: CodeCatalystProject) {
        const repos = this.client
            .listSourceRepositories({
                spaceName: project.org.name,
                projectName: project.name,
            })
            .flatten()

        const branches = repos.map(r =>
            this.client
                .listBranches({
                    spaceName: r.org.name,
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
        settings: DevEnvironmentSettings,
        key: keyof DevEnvironmentSettings,
        org?: Pick<CodeCatalystOrg, 'name'>
    ): Promise<DevEnvironmentSettings> {
        const subscriptionType = isNonNullable(org)
            ? await this.client
                  .getSubscription({ spaceName: org.name })
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

    public async submit(settings: DevEnvironmentSettings, source: SourceResponse) {
        const devenv = await this.createDevEnvOfType(settings, source)
        this.commands.openDevEnv.execute(devenv)
    }

    public async createDevEnvOfType(settings: DevEnvironmentSettings, source: SourceResponse) {
        const devenv: DevEnvironment = await (() => {
            switch (source.type) {
                case 'none':
                    return this.createEmptyDevEnv(settings, source)
                case 'linked':
                    return this.createLinkedDevEnv(settings, source)
            }
        })()

        recordSource('Webview')
        telemetry.codecatalyst_createDevEnvironment.record({ codecatalyst_createDevEnvironmentRepoType: source.type })

        this.onComplete(devenv)
        return devenv
    }

    private async createEmptyDevEnv(settings: DevEnvironmentSettings, source: EmptyResponse) {
        return this.client.createDevEnvironment({
            ides: [{ name: 'VSCode' }],
            projectName: source.selectedProject.name,
            spaceName: source.selectedProject.org.name,
            ...settings,
        })
    }

    private async createLinkedDevEnv(settings: DevEnvironmentSettings, source: LinkedResponse) {
        const isNewBranch = !!source.newBranch
        if (isNewBranch) {
            await this.client.createSourceBranch({
                name: source.newBranch,
                spaceName: source.selectedProject.org.name,
                projectName: source.selectedProject.name,
                sourceRepositoryName: source.selectedBranch.repo.name,
                headCommitId: source.selectedBranch.headCommitId,
            })
        }

        const branchName = isNewBranch ? source.newBranch : source.selectedBranch.name.replace('refs/heads/', '')
        return this.client.createDevEnvironment({
            ides: [{ name: 'VSCode' }],
            projectName: source.selectedProject.name,
            spaceName: source.selectedProject.org.name,
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
const Panel = VueWebview.compilePanel(CodeCatalystCreateWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined
let submitPromise: Promise<void> | undefined

export async function showCreateDevEnv(
    client: CodeCatalystClient,
    ctx: vscode.ExtensionContext,
    commands: typeof CodeCatalystCommands.declared
): Promise<void> {
    submitPromise ??= new Promise<void>((resolve, reject) => {
        activePanel ??= new Panel(ctx, client, commands, devenv => {
            if (devenv === undefined) {
                reject(new CancellationError('user'))
            } else {
                resolve()
            }
        })
    })

    const webview = await activePanel!.show({
        title: localize('AWS.view.createDevEnv.title', 'Create a CodeCatalyst Dev Environment'),
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
