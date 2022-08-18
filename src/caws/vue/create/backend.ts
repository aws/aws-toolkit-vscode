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
} from '../../wizards/workspaceSettings'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { CawsBranch, CawsProject, ConnectedCawsClient, DevelopmentWorkspace } from '../../../shared/clients/cawsClient'
import { cloneToWorkspace } from '../../model'
import { selectCawsResource } from '../../wizards/selectResource'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { Metric } from '../../../shared/telemetry/metric'
import { GitExtension } from '../../../shared/extensions/git'
import { ChildProcess } from '../../../shared/utilities/childProcess'
import { SSH_AGENT_SOCKET_VARIABLE, startSshAgent } from '../../../shared/extensions/ssh'
import { isCloud9 } from '../../../shared/extensionUtilities'

interface LinkedResponse {
    readonly type: 'linked'
    readonly selectedProject: CawsProject
    readonly selectedBranch: CawsBranch
    readonly newBranch: string
}

interface CloneResponse {
    readonly type: 'unlinked'
    readonly repositoryUrl: string
}

interface EmptyResponse {
    readonly type: 'none'
}

export type SourceResponse = LinkedResponse | CloneResponse | EmptyResponse

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

    public async validateRepositoryUrl(url: string): Promise<string | undefined> {
        const gitPath = GitExtension.instance?.gitPath
        if (!gitPath) {
            return localize(
                'aws.caws.create.noGit',
                'No `git` executable found. Verify that the Git extension is enabled.'
            )
        }

        const uri = toStictUri(url)
        const spawnOptions =
            uri.scheme === 'ssh' ? { env: { [SSH_AGENT_SOCKET_VARIABLE]: await startSshAgent() } } : undefined

        const command = new ChildProcess(gitPath, ['ls-remote', '--', url, 'HEAD'])
        const { exitCode } = await command.run({ spawnOptions, rejectOnError: true })

        if (exitCode !== 0) {
            if (uri.scheme === 'ssh') {
                return localize(
                    'aws.caws.create.gitFailedSsh',
                    'Invalid URL. Check that the repository exists and you have added an SSH key to your agent.'
                )
            } else {
                return localize(
                    'aws.caws.create.gitFailed',
                    'Invalid URL. Check that the repository exists and you have access to it.'
                )
            }
        }
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
            case 'persistentStorage':
                return prompt(createStoragePrompter())
        }
    }

    public async submit(settings: WorkspaceSettings, source: SourceResponse) {
        const workspace: DevelopmentWorkspace = await (() => {
            switch (source.type) {
                case 'none':
                    return this.createEmptyWorkpace(settings, source)
                case 'linked':
                    return this.createLinkedWorkspace(settings, source)
                case 'unlinked':
                    return this.cloneRepository(settings, source)
            }
        })()

        Metric.get('caws_createWorkspace').record('caws_createWorkspaceRepoType', source.type)
        Metric.get('caws_connect').record('source', 'Webview')

        this.onComplete(workspace)
        this.commands.openWorkspace.execute(workspace)
    }

    private async createEmptyWorkpace(settings: WorkspaceSettings, source: EmptyResponse) {
        const project = await selectCawsResource(this.client, 'project')
        if (!project) {
            throw new CancellationError('user')
        }

        return this.client.createDevelopmentWorkspace({
            ides: [{ name: 'VSCode' }],
            projectName: project.name,
            organizationName: project.org.name,
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
            // XXX: Workspaces now require an alias. Need to change UX so we don't do this.
            // remove after Velox fixes model by setting min alias length to 0
            alias: settings.alias === undefined || settings.alias === '' ? 'Workspace' : settings.alias,
        })
    }

    private async cloneRepository(settings: WorkspaceSettings, source: CloneResponse) {
        const repoUri = toStictUri(source.repositoryUrl)
        const repoName = repoUri.path
            .split('/')
            .pop()
            ?.replace(/\.git$/, '')

        if (!repoName) {
            throw new TypeError('No repository name found')
        }

        const org = await selectCawsResource(this.client, 'org')
        if (!org) {
            throw new CancellationError('user')
        }

        const existingProject = await this.getUnlinkedProject(org.name, repoName)
        const workspace = await this.client.createDevelopmentWorkspace({
            ides: [{ name: 'VSCode' }],
            projectName: existingProject.name,
            organizationName: existingProject.org.name,
            ...settings,
        })

        await cloneToWorkspace(this.client, workspace, { name: repoName, location: repoUri })

        return workspace
    }

    private async getUnlinkedProject(organizationName: string, repoName: string): Promise<CawsProject> {
        const existingProject = await this.client.getProject({ name: repoName, organizationName }).catch(err => {
            if ((err as any).statusCode === 404) {
                return undefined
            } else {
                throw err
            }
        })

        return (
            existingProject ??
            this.client.createProject({
                name: repoName,
                organizationName,
                displayName: repoName,
                description: localize('aws.caws.createProject.description', 'Created by AWS Toolkit for Workspaces'),
            })
        )
    }
}

function toStictUri(url: string): vscode.Uri {
    const isSchemeless = /^[\w]+@/.test(url)
    const withScheme = isSchemeless ? `ssh://${url}` : url

    return vscode.Uri.parse(withScheme, true)
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
