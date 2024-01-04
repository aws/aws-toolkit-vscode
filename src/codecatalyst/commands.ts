/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { selectCodeCatalystRepository, selectCodeCatalystResource } from './wizards/selectResource'
import { openCodeCatalystUrl } from './utils'
import { CodeCatalystAuthenticationProvider } from './auth'
import { Commands, placeholder } from '../shared/vscode/commands2'
import { CodeCatalystClient, CodeCatalystResource, createClient } from '../shared/clients/codecatalystClient'
import { DevEnvironmentId, getConnectedDevEnv, openDevEnv } from './model'
import { showConfigureDevEnv } from './vue/configure/backend'
import { showCreateDevEnv } from './vue/create/backend'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError, errorCode } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { showConfirmationMessage } from '../shared/utilities/messages'
import { AccountStatus } from '../shared/telemetry/telemetryClient'
import { CreateDevEnvironmentRequest, UpdateDevEnvironmentRequest } from 'aws-sdk/clients/codecatalyst'
import { Auth } from '../auth/auth'
import { SsoConnection } from '../auth/connection'
import { showManageConnections } from '../auth/ui/vue/show'

/** "List CodeCatalyst Commands" command. */
export async function listCommands(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.quickOpen', '> CodeCatalyst')
}

/** "Clone CodeCatalyst Repository" command. */
export async function cloneCodeCatalystRepo(client: CodeCatalystClient, url?: vscode.Uri): Promise<void> {
    let resource: { name: string; project: string; org: string }
    if (!url) {
        const r = await selectCodeCatalystRepository(client, false)
        if (!r) {
            throw new CancellationError('user')
        }
        resource = { name: r.name, project: r.project.name, org: r.org.name }
    } else {
        const [_, org, project, repo] = url.path.slice(1).split('/')
        if (!org || !project || !repo) {
            throw new Error(`Invalid CodeCatalyst URL: unable to parse repository`)
        }
        resource = { name: repo, project, org }
    }

    const uri = await client.getRepoCloneUrl({
        spaceName: resource.org,
        projectName: resource.project,
        sourceRepositoryName: resource.name,
    })
    await vscode.commands.executeCommand('git.clone', uri)
}

/**
 * Implements commands:
 * - "Open CodeCatalyst Space"
 * - "Open CodeCatalyst Project"
 * - "Open CodeCatalyst Repository"
 */
export async function openCodeCatalystResource(
    client: CodeCatalystClient,
    kind: CodeCatalystResource['type']
): Promise<void> {
    const resource = await selectCodeCatalystResource(client, kind)

    if (!resource) {
        throw new CancellationError('user')
    }

    openCodeCatalystUrl(resource)
}

export async function stopDevEnv(
    client: CodeCatalystClient,
    devenv: DevEnvironmentId,
    opts?: { readonly showPrompt?: boolean }
): Promise<void> {
    if (opts?.showPrompt) {
        const confirmed = await showConfirmationMessage({
            prompt: localize(
                'aws.codecatalyst.stopDevEnv.confirm',
                'Stopping the Dev Environment will end all processes. Continue?'
            ),
        })

        if (!confirmed) {
            throw new CancellationError('user')
        }
    }

    await client.stopDevEnvironment({
        id: devenv.id,
        projectName: devenv.project.name,
        spaceName: devenv.org.name,
    })
}

export async function deleteDevEnv(client: CodeCatalystClient, devenv: DevEnvironmentId): Promise<void> {
    await client.deleteDevEnvironment({
        id: devenv.id,
        projectName: devenv.project.name,
        spaceName: devenv.org.name,
    })
}

export type DevEnvironmentSettings = Pick<
    CreateDevEnvironmentRequest,
    'alias' | 'instanceType' | 'inactivityTimeoutMinutes' | 'persistentStorage'
>

export type UpdateDevEnvironmentSettings = Pick<
    UpdateDevEnvironmentRequest,
    'alias' | 'instanceType' | 'inactivityTimeoutMinutes'
>

export async function updateDevEnv(
    client: CodeCatalystClient,
    devenv: DevEnvironmentId,
    settings: UpdateDevEnvironmentSettings
) {
    return client.updateDevEnvironment({
        ...settings,
        id: devenv.id,
        projectName: devenv.project.name,
        spaceName: devenv.org.name,
    })
}

function createClientInjector(authProvider: CodeCatalystAuthenticationProvider): ClientInjector {
    return async (command, ...args) => {
        telemetry.record({ userId: AccountStatus.NotSet })

        await authProvider.restore()
        const conn = authProvider.activeConnection
        if (!conn) {
            // TODO: In the future, it would be very nice to open a connection picker here.
            throw new ToolkitError('Not connected to CodeCatalyst', { code: 'NoConnectionBadState' })
        }
        const validatedConn = await validateConnection(conn, authProvider.auth)
        const client = await createClient(validatedConn)
        telemetry.record({ userId: client.identity.id })

        return command(client, ...args)
    }
}

/**
 * Returns a connection that is ensured to be authenticated.
 *
 * Provides the user the ability to re-authenticate if needed,
 * otherwise throwing an error.
 */
async function validateConnection(conn: SsoConnection, auth: Auth): Promise<SsoConnection> {
    if (auth.getConnectionState(conn) === 'valid') {
        return conn
    }

    // Have user try to log in
    const loginMessage = localize('aws.auth.invalidConnection', 'Connection is invalid or expired, login again?')
    const result = await vscode.window.showErrorMessage(loginMessage, 'Login')

    if (result !== 'Login') {
        throw new ToolkitError('User cancelled login.', { cancelled: true, code: errorCode.invalidConnection })
    }

    conn = await auth.reauthenticate(conn)

    // Log in attempt failed
    if (auth.getConnectionState(conn) !== 'valid') {
        throw new ToolkitError('Login failed.', { code: errorCode.invalidConnection })
    }

    return conn
}

function createCommandDecorator(commands: CodeCatalystCommands): CommandDecorator {
    return command =>
        (...args) =>
            commands.withClient(command, ...args)
}

interface CodeCatalystCommand<T extends any[], U> {
    (client: CodeCatalystClient, ...args: T): U | Promise<U>
}

interface ClientInjector {
    <T extends any[], U>(command: CodeCatalystCommand<T, U>, ...args: T): Promise<U>
}

interface CommandDecorator {
    <T extends any[], U>(command: CodeCatalystCommand<T, U>): (...args: T) => Promise<U>
}

type Inject<T, U> = T extends (...args: infer P) => infer R
    ? P extends [U, ...infer L]
        ? (...args: L) => R
        : never
    : never

type WithClient<T> = Parameters<Inject<T, CodeCatalystClient>>

export class CodeCatalystCommands {
    public readonly withClient: ClientInjector
    public readonly bindClient = createCommandDecorator(this)

    public constructor(private authProvider: CodeCatalystAuthenticationProvider) {
        this.withClient = createClientInjector(authProvider)
    }

    public listCommands() {
        return listCommands()
    }

    public cloneRepository(...args: WithClient<typeof cloneCodeCatalystRepo>) {
        return this.withClient(cloneCodeCatalystRepo, ...args)
    }

    public createDevEnv(): Promise<void> {
        return this.withClient(showCreateDevEnv, globals.context, CodeCatalystCommands.declared)
    }

    public openResource(...args: WithClient<typeof openCodeCatalystResource>) {
        return this.withClient(openCodeCatalystResource, ...args)
    }

    public stopDevEnv(...args: WithClient<typeof stopDevEnv>) {
        return this.withClient(stopDevEnv, ...args).then(() => {
            void vscode.commands.executeCommand('workbench.action.remote.close')
        })
    }

    public deleteDevEnv(...args: WithClient<typeof deleteDevEnv>) {
        return this.withClient(deleteDevEnv, ...args)
    }

    public updateDevEnv(...args: WithClient<typeof updateDevEnv>) {
        telemetry.record({
            codecatalyst_updateDevEnvironmentLocationType: 'remote',
        })

        return this.withClient(updateDevEnv, ...args)
    }

    public openSpace() {
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

    public async openDevEnv(
        id?: DevEnvironmentId,
        targetPath?: string,
        connection?: { startUrl: string; region: string }
    ): Promise<void> {
        if (vscode.env.remoteName === 'ssh-remote') {
            throw new ToolkitError('Cannot connect from a remote context. Try again from a local VS Code instance.', {
                code: 'ConnectedToRemote',
            })
        }

        const devenv = id ?? (await this.selectDevEnv())

        // TODO(sijaden): add named timestamp markers for granular duration info
        //
        // right now this command may prompt the user if they came from the explorer or command palette
        // need to be careful of mapping explosion so this granular data would either need
        // to be flattened or we restrict the names to a pre-determined set
        if (id === undefined) {
            telemetry.record({ source: 'CommandPalette' })
        }

        if (connection !== undefined) {
            await this.authProvider.tryConnectTo(connection)
        } else if (!this.authProvider.isConnectionValid()) {
            void showManageConnections.execute(placeholder, 'codecatalystDeveloperTools', 'codecatalyst')
            return
        }

        return this.withClient(openDevEnv, devenv, targetPath)
    }

    public async openDevEnvSettings(): Promise<void> {
        const devenv = await this.withClient(getConnectedDevEnv)

        return this.withClient(showConfigureDevEnv, globals.context, devenv, CodeCatalystCommands.declared)
    }

    private async selectDevEnv(): Promise<DevEnvironmentId> {
        const devenv = await this.withClient(selectCodeCatalystResource, 'devEnvironment' as const)

        if (!devenv) {
            throw new CancellationError('user')
        }

        return devenv
    }

    public static fromContext(ctx: Pick<vscode.ExtensionContext, 'secrets' | 'globalState'>) {
        const auth = CodeCatalystAuthenticationProvider.fromContext(ctx)

        return new this(auth)
    }

    public static readonly declared = {
        openResource: Commands.from(this).declareOpenResource('aws.codecatalyst.openResource'),
        listCommands: Commands.from(this).declareListCommands('aws.codecatalyst.listCommands'),
        openSpace: Commands.from(this).declareOpenSpace('aws.codecatalyst.openOrg'),
        openProject: Commands.from(this).declareOpenProject('aws.codecatalyst.openProject'),
        openRepository: Commands.from(this).declareOpenRepository('aws.codecatalyst.openRepo'),
        stopDevEnv: Commands.from(this).declareStopDevEnv('aws.codecatalyst.stopDevEnv'),
        deleteDevEnv: Commands.from(this).declareDeleteDevEnv('aws.codecatalyst.deleteDevEnv'),
        openDevEnvSettings: Commands.from(this).declareOpenDevEnvSettings('aws.codecatalyst.openDevEnvSettings'),
        openDevfile: Commands.from(this).declareOpenDevfile('aws.codecatalyst.openDevfile'),
        cloneRepo: Commands.from(this).declareCloneRepository({
            id: 'aws.codecatalyst.cloneRepo',
            telemetryName: 'codecatalyst_localClone',
        }),
        createDevEnv: Commands.from(this).declareCreateDevEnv({
            id: 'aws.codecatalyst.createDevEnv',
            telemetryName: 'codecatalyst_createDevEnvironment',
        }),
        updateDevEnv: Commands.from(this).declareUpdateDevEnv({
            id: 'aws.codecatalyst.updateDevEnv',
            telemetryName: 'codecatalyst_updateDevEnvironmentSettings',
        }),
        openDevEnv: Commands.from(this).declareOpenDevEnv({
            id: 'aws.codecatalyst.openDevEnv',
            telemetryName: 'codecatalyst_connect',
        }),
    } as const
}
