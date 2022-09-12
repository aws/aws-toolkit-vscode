/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'
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
import { CreateDevelopmentWorkspaceRequest } from '../../types/clientcodeaws'
import { showCreateWorkspace } from './vue/create/backend'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { showConfirmationMessage } from '../shared/utilities/messages'

async function login(authProvider: CawsAuthenticationProvider, client: CawsClient) {
    const wizard = new LoginWizard(authProvider)
    const lastSession = authProvider.getActiveSession()
    const response = await wizard.run()

    if (!response) {
        throw new CancellationError('user')
    }

    try {
        const { accountDetails, accessDetails } = response.session
        const connectedClient = await client.setCredentials(accessDetails, accountDetails.metadata)

        if (lastSession && response.session.id !== lastSession.id) {
            authProvider.deleteSession(lastSession)
        }

        return connectedClient
    } catch (err) {
        throw ToolkitError.chain(err, 'Failed to connect to REMOVED.codes', { code: 'NotConnected' })
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
    vscode.commands.executeCommand('workbench.action.quickOpen', '> REMOVED.codes')
}

/** "Clone REMOVED.codes Repository" command. */
export async function cloneCawsRepo(client: ConnectedCawsClient, url?: vscode.Uri): Promise<void> {
    async function getPat() {
        // FIXME: make it easier to go from auth -> client so we don't need to do this
        const auth = CawsAuthenticationProvider.fromContext(globals.context)
        return auth.getPat(client)
    }

    if (!url) {
        const r = await selectCawsResource(client, 'repo')
        if (!r) {
            throw new CancellationError('user')
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
    const resource = await selectCawsResource(client, kind)

    if (!resource) {
        throw new CancellationError('user')
    }

    openCawsUrl(resource)
}

export async function stopWorkspace(
    client: ConnectedCawsClient,
    workspace: DevelopmentWorkspaceId,
    opts?: { readonly showPrompt?: boolean }
): Promise<void> {
    if (opts?.showPrompt) {
        const confirmed = await showConfirmationMessage({
            prompt: localize(
                'aws.caws.stopWorkspace.confirm',
                'Stopping the workspace will end all running processes. Continue?'
            ),
        })

        if (!confirmed) {
            throw new CancellationError('user')
        }
    }

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
    CreateDevelopmentWorkspaceRequest,
    'alias' | 'instanceType' | 'inactivityTimeoutMinutes' | 'persistentStorage'
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
            return command(await login(authProvider, client), ...args)
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

    public createWorkspace(): Promise<void> {
        return this.withClient(showCreateWorkspace, globals.context, CawsCommands.declared)
    }

    public openResource(...args: WithClient<typeof openCawsResource>) {
        return this.withClient(openCawsResource, ...args)
    }

    public stopWorkspace(...args: WithClient<typeof stopWorkspace>) {
        return this.withClient(stopWorkspace, ...args).then(() => {
            vscode.commands.executeCommand('workbench.action.remote.close')
        })
    }

    public deleteWorkspace(...args: WithClient<typeof deleteWorkspace>) {
        return this.withClient(deleteWorkspace, ...args)
    }

    public updateWorkspace(...args: WithClient<typeof updateWorkspace>) {
        telemetry.caws_updateWorkspaceSettings.record({ caws_updateWorkspaceLocationType: 'remote' })

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

    public async openWorkspace(id?: DevelopmentWorkspaceId, targetPath?: string): Promise<void> {
        if (vscode.env.remoteName === 'ssh-remote') {
            throw new ToolkitError('Cannot open workspace when connected to a remote environment', {
                code: 'ConnectedToRemote',
            })
        }

        const workspace = id ?? (await this.selectWorkspace())

        // TODO(sijaden): add named timestamp markers for granular duration info
        //
        // right now this command may prompt the user if they came from the explorer or command palette
        // need to be careful of mapping explosion so this granular data would either need
        // to be flattened or we restrict the names to a pre-determined set
        if (id === undefined) {
            telemetry.caws_connect.record({ source: 'CommandPalette' })
        }

        return this.withClient(openDevelopmentWorkspace, workspace, targetPath)
    }

    public async openWorkspaceSettings(): Promise<void> {
        const workspace = await this.withClient(getConnectedWorkspace)

        if (!workspace) {
            throw new Error('No workspace available')
        }

        return showConfigureWorkspace(globals.context, workspace, CawsCommands.declared)
    }

    private async selectWorkspace(): Promise<DevelopmentWorkspaceId> {
        const workspace = await this.withClient(selectCawsResource, 'developmentWorkspace' as const)

        if (!workspace) {
            throw new CancellationError('user')
        }

        return workspace
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
        listCommands: Commands.from(this).declareListCommands('aws.caws.listCommands'),
        openOrganization: Commands.from(this).declareOpenOrganization('aws.caws.openOrg'),
        openProject: Commands.from(this).declareOpenProject('aws.caws.openProject'),
        openRepository: Commands.from(this).declareOpenRepository('aws.caws.openRepo'),
        stopWorkspace: Commands.from(this).declareStopWorkspace('aws.caws.stopWorkspace'),
        deleteWorkspace: Commands.from(this).declareDeleteWorkspace('aws.caws.deleteWorkspace'),
        openWorkspaceSettings: Commands.from(this).declareOpenWorkspaceSettings('aws.caws.openWorkspaceSettings'),
        openDevfile: Commands.from(this).declareOpenDevfile('aws.caws.openDevfile'),
        cloneRepo: Commands.from(this).declareCloneRepository({
            id: 'aws.caws.cloneRepo',
            telemetryName: 'caws_localClone',
        }),
        createWorkspace: Commands.from(this).declareCreateWorkspace({
            id: 'aws.caws.createWorkspace',
            telemetryName: 'caws_createWorkspace',
        }),
        updateWorkspace: Commands.from(this).declareUpdateWorkspace({
            id: 'aws.caws.updateWorkspace',
            telemetryName: 'caws_updateWorkspaceSettings',
        }),
        openWorkspace: Commands.from(this).declareOpenWorkspace({
            id: 'aws.caws.openWorkspace',
            telemetryName: 'caws_connect',
        }),
    } as const
}
