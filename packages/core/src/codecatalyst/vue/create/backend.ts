/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
    isThirdPartyRepo,
} from '../../../shared/clients/codecatalystClient'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { isNonNullable } from '../../../shared/utilities/tsUtils'
import { createOrgPrompter, createProjectPrompter } from '../../wizards/selectResource'
import { GetSourceRepositoryCloneUrlsRequest } from 'aws-sdk/clients/codecatalyst'
import { QuickPickPrompter } from '../../../shared/ui/pickerPrompter'

interface LinkedResponse {
    readonly type: 'linked'
    readonly selectedSpace: Pick<CodeCatalystOrg, 'name'>
    readonly selectedProject: CodeCatalystProject
    readonly selectedBranch: CodeCatalystBranch
    readonly newBranch: string
}

interface EmptyResponse {
    readonly type: 'none'
    readonly selectedSpace: Pick<CodeCatalystOrg, 'name'>
    readonly selectedProject: CodeCatalystProject
}

export type SourceResponse = LinkedResponse | EmptyResponse

export class CodeCatalystCreateWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/codecatalyst/vue/create/index.js'
    public readonly id = 'createCodeCatalyst'

    private projectPrompter?: QuickPickPrompter<CodeCatalystProject>
    private spacePrompter?: QuickPickPrompter<CodeCatalystOrg>

    public constructor(
        private readonly client: CodeCatalystClient,
        private readonly commands: typeof CodeCatalystCommands.declared,
        private readonly onComplete: (devenv?: DevEnvironment) => void
    ) {
        super(CodeCatalystCreateWebview.sourcePath)

        // triggers pre-loading of Spaces
        this.spacePrompter = createOrgPrompter(client)
    }

    public close() {
        this.dispose()
        this.onComplete()
    }

    /**
     * Opens a quick pick that lists all Spaces of the user.
     *
     * @returns Space if it was selected, otherwise undefined due to user cancellation.
     */
    public async quickPickSpace(): Promise<CodeCatalystOrg | undefined> {
        this.spacePrompter = this.spacePrompter ?? createOrgPrompter(this.client)
        const selectedSpace = await this.spacePrompter.prompt()
        this.spacePrompter = undefined // We want the prompter to be re-created on subsequent calls

        if (!isValidResponse(selectedSpace)) {
            return undefined
        }

        // This will initiate preloading of the projects
        this.projectPrompter = createProjectPrompter(this.client, selectedSpace?.name)

        return selectedSpace
    }

    /**
     * Opens a quick pick that lists all Projects from a given Space.
     *
     * @param spaceName Space to show Projects from
     * @returns Project if it was selected, otherwise undefined due to user cancellation.
     */
    public async quickPickProject(spaceName: CodeCatalystOrg['name']): Promise<CodeCatalystProject | undefined> {
        this.projectPrompter = this.projectPrompter ?? createProjectPrompter(this.client, spaceName)
        const selectedProject = await this.projectPrompter.prompt()
        this.projectPrompter = undefined // We want the prompter to be re-created on subsequent calls

        if (!isValidResponse(selectedProject)) {
            return undefined
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

    public isThirdPartyRepo(codeCatalystRepo: GetSourceRepositoryCloneUrlsRequest): Promise<boolean> {
        return isThirdPartyRepo(this.client, codeCatalystRepo)
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
        void this.commands.openDevEnv.execute(devenv)
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

        telemetry.record({
            source: 'Webview',
            codecatalyst_createDevEnvironmentRepoType: source.type,
        })

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
