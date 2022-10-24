/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { LoginWizard } from './wizards/login'
import { selectCodeCatalystResource } from './wizards/selectResource'
import { openCodeCatalystUrl } from './utils'
import { CodeCatalystAuthenticationProvider } from './auth'
import { Commands } from '../shared/vscode/commands2'
import {
    CodeCatalystClient,
    ConnectedCodeCatalystClient,
    CodeCatalystResource,
} from '../shared/clients/codecatalystClient'
import {
    createClientFactory,
    DevEnvironmentId,
    getConnectedWorkspace,
    openDevelopmentWorkspace,
    toCodeCatalystGitUri,
} from './model'
import { showConfigureWorkspace } from './vue/configure/backend'
import { showCreateWorkspace } from './vue/create/backend'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { AccountStatus } from '../shared/telemetry/telemetryClient'
import { CreateDevEnvironmentRequest } from '../../types/clientcodecatalyst'

async function login(authProvider: CodeCatalystAuthenticationProvider, client: CodeCatalystClient) {
    const wizard = new LoginWizard(authProvider)
    const response = await wizard.run()

    if (!response) {
        throw new CancellationError('user')
    }

    try {
        const { accountDetails } = response.session

        return client.setCredentials(authProvider.createCredentialsProvider(), accountDetails.metadata)
    } catch (err) {
        throw ToolkitError.chain(err, 'Failed to connect to REMOVED.codes', { code: 'NotConnected' })
    }
}

/** "List REMOVED.codes Commands" command. */
export async function listCommands(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.quickOpen', '> REMOVED.codes')
}

/** "Clone REMOVED.codes Repository" command. */
export async function cloneCodeCatalystRepo(client: ConnectedCodeCatalystClient, url?: vscode.Uri): Promise<void> {
    async function getPat() {
        // FIXME: make it easier to go from auth -> client so we don't need to do this
        const auth = CodeCatalystAuthenticationProvider.fromContext(globals.context)
        return auth.getPat(client)
    }

    if (!url) {
        const r = await selectCodeCatalystResource(client, 'repo')
        if (!r) {
            throw new CancellationError('user')
        }
        const resource = { name: r.name, project: r.project.name, org: r.org.name }
        const uri = toCodeCatalystGitUri(client.identity.name, await getPat(), resource)
        await vscode.commands.executeCommand('git.clone', uri)
    } else {
        const [_, org, project, repo] = url.path.slice(1).split('/')
        if (!org || !project || !repo) {
            throw new Error(`Invalid REMOVED.codes URL: unable to parse repository`)
        }
        const resource = { name: repo, project, org }
        const uri = toCodeCatalystGitUri(client.identity.name, await getPat(), resource)
        await vscode.commands.executeCommand('git.clone', uri)
    }
}

/**
 * Implements commands:
 * - "Open REMOVED.codes Organization"
 * - "Open REMOVED.codes Project"
 * - "Open REMOVED.codes Repository"
 */
export async function openCodeCatalystResource(
    client: ConnectedCodeCatalystClient,
    kind: CodeCatalystResource['type']
): Promise<void> {
    const resource = await selectCodeCatalystResource(client, kind)

    if (!resource) {
        throw new CancellationError('user')
    }

    openCodeCatalystUrl(resource)
}

export async function stopWorkspace(
    client: ConnectedCodeCatalystClient,
    workspace: DevEnvironmentId,
    opts?: { readonly showPrompt?: boolean }
): Promise<void> {
    if (opts?.showPrompt) {
        const confirmed = await showConfirmationMessage({
            prompt: localize(
                'aws.codecatalyst.stopWorkspace.confirm',
                'Stopping the workspace will end all running processes. Continue?'
            ),
        })

        if (!confirmed) {
            throw new CancellationError('user')
        }
    }

    await client.stopDevEnvironment({
        id: workspace.id,
        projectName: workspace.project.name,
        organizationName: workspace.org.name,
    })
}

export async function deleteWorkspace(client: ConnectedCodeCatalystClient, workspace: DevEnvironmentId): Promise<void> {
    await client.deleteDevEnvironment({
        id: workspace.id,
        projectName: workspace.project.name,
        organizationName: workspace.org.name,
    })
}

export type DevEnvironmentSettings = Pick<
    CreateDevEnvironmentRequest,
    'alias' | 'instanceType' | 'inactivityTimeoutMinutes' | 'persistentStorage'
>

export async function updateWorkspace(
    client: ConnectedCodeCatalystClient,
    workspace: DevEnvironmentId,
    settings: DevEnvironmentSettings
): Promise<void> {
    await client.updateDevEnvironment({
        ...settings,
        id: workspace.id,
        projectName: workspace.project.name,
        organizationName: workspace.org.name,
    })
}

function createClientInjector(
    authProvider: CodeCatalystAuthenticationProvider,
    clientFactory: () => Promise<CodeCatalystClient>
): ClientInjector {
    return async (command, ...args) => {
        const client = await clientFactory()

        try {
            if (!client.connected) {
                return await command(await login(authProvider, client), ...args)
            }

            return await command(client, ...args)
        } finally {
            const userId = client.connected ? `codecatalyst;${client.identity.id}` : AccountStatus.NotApplicable

            // TODO(sijaden): should this mark only instantiated spans or future spans as well?
            // right now it won't mark spans if they're created and emitted prior to the command finishing
            telemetry.record({ userId })
        }
    }
}

function createCommandDecorator(commands: CodeCatalystCommands): CommandDecorator {
    return command =>
        (...args) =>
            commands.withClient(command, ...args)
}

interface CodeCatalystCommand<T extends any[], U> {
    (client: ConnectedCodeCatalystClient, ...args: T): U | Promise<U>
}

interface ClientInjector {
    <T extends any[], U>(command: CodeCatalystCommand<T, U>, ...args: T): Promise<U | undefined>
}

interface CommandDecorator {
    <T extends any[], U>(command: CodeCatalystCommand<T, U>): (...args: T) => Promise<U | undefined>
}

type Inject<T, U> = T extends (...args: infer P) => infer R
    ? P extends [U, ...infer L]
        ? (...args: L) => R
        : never
    : never

type WithClient<T> = Parameters<Inject<T, ConnectedCodeCatalystClient>>

export class CodeCatalystCommands {
    public readonly withClient: ClientInjector
    public readonly bindClient = createCommandDecorator(this)

    public constructor(
        private readonly authProvider: CodeCatalystAuthenticationProvider,
        private readonly clientFactory = createClientFactory(authProvider)
    ) {
        this.withClient = createClientInjector(authProvider, clientFactory)
    }

    public async login() {
        return login(this.authProvider, await this.clientFactory())
    }

    public logout() {
        return this.authProvider.logout()
    }

    public listCommands() {
        return listCommands()
    }

    public cloneRepository(...args: WithClient<typeof cloneCodeCatalystRepo>) {
        return this.withClient(cloneCodeCatalystRepo, ...args)
    }

    public createWorkspace(): Promise<void> {
        return this.withClient(showCreateWorkspace, globals.context, CodeCatalystCommands.declared)
    }

    public openResource(...args: WithClient<typeof openCodeCatalystResource>) {
        return this.withClient(openCodeCatalystResource, ...args)
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
        telemetry.codecatalyst_updateWorkspaceSettings.record({ codecatalyst_updateWorkspaceLocationType: 'remote' })

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

    public async openWorkspace(id?: DevEnvironmentId, targetPath?: string): Promise<void> {
        if (vscode.env.remoteName === 'ssh-remote') {
            throw new ToolkitError(
                'Cannot open workspace from a remote environment. Try again from a local VS Code instance.',
                {
                    code: 'ConnectedToRemote',
                }
            )
        }

        const workspace = id ?? (await this.selectWorkspace())

        // TODO(sijaden): add named timestamp markers for granular duration info
        //
        // right now this command may prompt the user if they came from the explorer or command palette
        // need to be careful of mapping explosion so this granular data would either need
        // to be flattened or we restrict the names to a pre-determined set
        if (id === undefined) {
            telemetry.codecatalyst_connect.record({ source: 'CommandPalette' })
        }

        return this.withClient(openDevelopmentWorkspace, workspace, targetPath)
    }

    public async openWorkspaceSettings(): Promise<void> {
        const workspace = await this.withClient(getConnectedWorkspace)

        if (!workspace) {
            throw new Error('No workspace available')
        }

        return this.withClient(showConfigureWorkspace, globals.context, workspace, CodeCatalystCommands.declared)
    }

    private async selectWorkspace(): Promise<DevEnvironmentId> {
        const workspace = await this.withClient(selectCodeCatalystResource, 'devEnvironment' as const)

        if (!workspace) {
            throw new CancellationError('user')
        }

        return workspace
    }

    public static fromContext(ctx: Pick<vscode.ExtensionContext, 'secrets' | 'globalState'>) {
        const auth = CodeCatalystAuthenticationProvider.fromContext(ctx)
        const factory = createClientFactory(auth)

        return new this(auth, factory)
    }

    public static readonly declared = {
        login: Commands.from(this).declareLogin('aws.codecatalyst.login'),
        logout: Commands.from(this).declareLogout('aws.codecatalyst.logout'),
        openResource: Commands.from(this).declareOpenResource('aws.codecatalyst.openResource'),
        listCommands: Commands.from(this).declareListCommands('aws.codecatalyst.listCommands'),
        openOrganization: Commands.from(this).declareOpenOrganization('aws.codecatalyst.openOrg'),
        openProject: Commands.from(this).declareOpenProject('aws.codecatalyst.openProject'),
        openRepository: Commands.from(this).declareOpenRepository('aws.codecatalyst.openRepo'),
        stopWorkspace: Commands.from(this).declareStopWorkspace('aws.codecatalyst.stopWorkspace'),
        deleteWorkspace: Commands.from(this).declareDeleteWorkspace('aws.codecatalyst.deleteWorkspace'),
        openWorkspaceSettings: Commands.from(this).declareOpenWorkspaceSettings(
            'aws.codecatalyst.openWorkspaceSettings'
        ),
        openDevfile: Commands.from(this).declareOpenDevfile('aws.codecatalyst.openDevfile'),
        cloneRepo: Commands.from(this).declareCloneRepository({
            id: 'aws.codecatalyst.cloneRepo',
            telemetryName: 'codecatalyst_localClone',
        }),
        createWorkspace: Commands.from(this).declareCreateWorkspace({
            id: 'aws.codecatalyst.createWorkspace',
            telemetryName: 'codecatalyst_createWorkspace',
        }),
        updateWorkspace: Commands.from(this).declareUpdateWorkspace({
            id: 'aws.codecatalyst.updateWorkspace',
            telemetryName: 'codecatalyst_updateWorkspaceSettings',
        }),
        openWorkspace: Commands.from(this).declareOpenWorkspace({
            id: 'aws.codecatalyst.openWorkspace',
            telemetryName: 'codecatalyst_connect',
        }),
    } as const
}
