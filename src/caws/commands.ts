/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'
import { getLogger } from '../shared/logger'
import { openCawsUrl } from './utils'
import { CawsAuthenticationProvider } from './auth'
import { Commands } from '../shared/vscode/commands2'
import { CawsClient, ConnectedCawsClient, CawsResource } from '../shared/clients/cawsClient'
import {
    createClientFactory,
    DevelopmentWorkspaceId,
    getConnectedWorkspace,
    openDevelopmentWorkspace,
    toCawsGitUri,
} from './model'
import { showConfigureWorkspace } from './vue/configure/backend'
import { UpdateDevelopmentWorkspaceRequest } from '../../types/clientcodeaws'
import { showCreateWorkspace } from './vue/create/backend'

type LoginResult = 'Succeeded' | 'Cancelled' | 'Failed'

export async function login(authProvider: CawsAuthenticationProvider, client: CawsClient): Promise<LoginResult> {
    // TODO: add telemetry
    const wizard = new LoginWizard(authProvider)
    const lastSession = authProvider.getActiveSession()
    const response = await wizard.run()

    if (!response) {
        return 'Cancelled'
    }

    try {
        const { accountDetails, accessDetails } = response.session
        await client.setCredentials(accessDetails, accountDetails.metadata)

        if (lastSession && response.session.id !== lastSession.id) {
            authProvider.deleteSession(lastSession)
        }

        return 'Succeeded'
    } catch (err) {
        getLogger().error('REMOVED.codes: failed to login: %O', err)
        return 'Failed'
    }
}

export async function logout(authProvider: CawsAuthenticationProvider): Promise<void> {
    const session = authProvider.getActiveSession()

    if (session) {
        return authProvider.deleteSession(session)
    }
}

/** "List REMOVED.codes Commands" command. */
export async function listCommands(): Promise<void> {
    // TODO: add telemetry
    vscode.commands.executeCommand('workbench.action.quickOpen', '> REMOVED.codes')
}

/** "Clone REMOVED.codes Repository" command. */
export async function cloneCawsRepo(client: ConnectedCawsClient, url?: vscode.Uri): Promise<void> {
    // TODO: add telemetry

    async function getPat() {
        // FIXME: make it easier to go from auth -> client so we don't need to do this
        const auth = CawsAuthenticationProvider.fromContext(globals.context)
        return auth.getPat(client)
    }

    if (!url) {
        const r = await selectCawsResource(client, 'repo')
        if (!r) {
            return
        }
        const resource = { name: r.name, project: r.project.name, org: r.org.name }
        const uri = toCawsGitUri(client.identity.name, await getPat(), resource)
        await vscode.commands.executeCommand('git.clone', uri)
    } else {
        const [_, org, project, repo] = url.path.slice(1).split('/')
        if (!org || !project || !repo) {
            throw new Error(`Invalid REMOVED.codes URL: unable to parse repository`)
        }
        const resource = { name: repo, project, org }
        const uri = toCawsGitUri(client.identity.name, await getPat(), resource)
        await vscode.commands.executeCommand('git.clone', uri)
    }
}

/**
 * Implements commands:
 * - "Open REMOVED.codes Organization"
 * - "Open REMOVED.codes Project"
 * - "Open REMOVED.codes Repository"
 */
export async function openCawsResource(client: ConnectedCawsClient, kind: CawsResource['type']): Promise<void> {
    // TODO: add telemetry
    const resource = await selectCawsResource(client, kind)

    if (!resource) {
        return
    }

    if (resource.type !== 'developmentWorkspace') {
        openCawsUrl(resource)
        return
    }

    try {
        await openDevelopmentWorkspace(client, resource)
    } catch (err) {
        showViewLogsMessage(
            localize(
                'AWS.command.caws.createWorkspace.failed',
                'Failed to start REMOVED.codes development workspace "{0}": {1}',
                resource.id,
                (err as Error).message
            )
        )
    }
}

export async function stopWorkspace(client: ConnectedCawsClient, workspace: DevelopmentWorkspaceId): Promise<void> {
    await client.stopDevelopmentWorkspace({
        id: workspace.id,
        projectName: workspace.project.name,
        organizationName: workspace.org.name,
    })
}

export async function deleteWorkspace(client: ConnectedCawsClient, workspace: DevelopmentWorkspaceId): Promise<void> {
    await client.deleteDevelopmentWorkspace({
        id: workspace.id,
        projectName: workspace.project.name,
        organizationName: workspace.org.name,
    })
}

export type WorkspaceSettings = Pick<
    UpdateDevelopmentWorkspaceRequest,
    'alias' | 'instanceType' | 'inactivityTimeoutMinutes'
>

export async function updateWorkspace(
    client: ConnectedCawsClient,
    workspace: DevelopmentWorkspaceId,
    settings: WorkspaceSettings
): Promise<void> {
    await client.updateDevelopmentWorkspace({
        ...settings,
        id: workspace.id,
        projectName: workspace.project.name,
        organizationName: workspace.org.name,
    })
}

function createClientInjector(
    authProvider: CawsAuthenticationProvider,
    clientFactory: () => Promise<CawsClient>
): ClientInjector {
    return async (command, ...args) => {
        const client = await clientFactory()

        if (!client.connected) {
            const result = await login(authProvider, client)

            if (result === 'Succeeded' && client.connected) {
                return command(client, ...args)
            }

            if (result === 'Failed') {
                globals.window.showErrorMessage('Not connected to REMOVED.codes')
            }

            return
        }

        return command(client, ...args)
    }
}

function createCommandDecorator(commands: CawsCommands): CommandDecorator {
    return command =>
        (...args) =>
            commands.withClient(command, ...args)
}

interface CawsCommand<T extends any[], U> {
    (client: ConnectedCawsClient, ...args: T): U | Promise<U>
}

interface ClientInjector {
    <T extends any[], U>(command: CawsCommand<T, U>, ...args: T): Promise<U | undefined>
}

interface CommandDecorator {
    <T extends any[], U>(command: CawsCommand<T, U>): (...args: T) => Promise<U | undefined>
}

type Inject<T, U> = T extends (...args: infer P) => infer R
    ? P extends [U, ...infer L]
        ? (...args: L) => R
        : never
    : never

type WithClient<T> = Parameters<Inject<T, ConnectedCawsClient>>

export class CawsCommands {
    public readonly withClient: ClientInjector
    public readonly bindClient = createCommandDecorator(this)

    public constructor(
        private readonly authProvider: CawsAuthenticationProvider,
        private readonly clientFactory = createClientFactory(authProvider)
    ) {
        this.withClient = createClientInjector(authProvider, clientFactory)
    }

    public async login() {
        return login(this.authProvider, await this.clientFactory())
    }

    public logout() {
        return logout(this.authProvider)
    }

    public listCommands() {
        return listCommands()
    }

    public cloneRepository(...args: WithClient<typeof cloneCawsRepo>) {
        return this.withClient(cloneCawsRepo, ...args)
    }

    public createWorkspace() {
        return this.withClient(showCreateWorkspace.bind(undefined, globals.context))
    }

    public openResource(...args: WithClient<typeof openCawsResource>) {
        return this.withClient(openCawsResource, ...args)
    }

    public stopWorkspace(...args: WithClient<typeof stopWorkspace>) {
        return this.withClient(stopWorkspace, ...args)
    }

    public deleteWorkspace(...args: WithClient<typeof deleteWorkspace>) {
        return this.withClient(deleteWorkspace, ...args)
    }

    public updateWorkspace(...args: WithClient<typeof updateWorkspace>) {
        return this.withClient(updateWorkspace, ...args)
    }

    public openOrganization() {
        return this.openResource('org')
    }

    public openProject() {
        return this.openResource('project')
    }

    public openRepository() {
        return this.openResource('repo')
    }

    public async openDevfile(uri: vscode.Uri) {
        await vscode.window.showTextDocument(uri)
    }

    public openWorkspace(workspace?: DevelopmentWorkspaceId) {
        if (workspace) {
            return this.withClient(openDevelopmentWorkspace, workspace)
        } else {
            return this.openResource('developmentWorkspace')
        }
    }

    public async openWorkspaceSettings() {
        const workspace = await this.withClient(getConnectedWorkspace)

        if (!workspace) {
            throw new Error('No workspace available')
        }

        return showConfigureWorkspace(globals.context, workspace, CawsCommands.declared)
    }

    public static fromContext(ctx: Pick<vscode.ExtensionContext, 'secrets' | 'globalState'>) {
        const auth = CawsAuthenticationProvider.fromContext(ctx)
        const factory = createClientFactory(auth)

        return new this(auth, factory)
    }

    public static readonly declared = {
        login: Commands.from(this).declareLogin('aws.caws.login'),
        logout: Commands.from(this).declareLogout('aws.caws.logout'),
        openResource: Commands.from(this).declareOpenResource('aws.caws.openResource'),
        cloneRepo: Commands.from(this).declareCloneRepository('aws.caws.cloneRepo'),
        listCommands: Commands.from(this).declareListCommands('aws.caws.listCommands'),
        createWorkspace: Commands.from(this).declareCreateWorkspace('aws.caws.createWorkspace'),
        openOrganization: Commands.from(this).declareOpenOrganization('aws.caws.openOrg'),
        openProject: Commands.from(this).declareOpenProject('aws.caws.openProject'),
        openRepository: Commands.from(this).declareOpenRepository('aws.caws.openRepo'),
        openWorkspace: Commands.from(this).declareOpenWorkspace('aws.caws.openWorkspace'),
        stopWorkspace: Commands.from(this).declareStopWorkspace('aws.caws.stopWorkspace'),
        deleteWorkspace: Commands.from(this).declareDeleteWorkspace('aws.caws.deleteWorkspace'),
        updateWorkspace: Commands.from(this).declareUpdateWorkspace('aws.caws.updateWorkspace'),
        openDevfile: Commands.from(this).declareOpenDevfile('aws.caws.openDevfile'),
        openWorkspaceSettings: Commands.from(this).declareOpenWorkspaceSettings('aws.caws.openWorkspaceSettings'),
    } as const
}
