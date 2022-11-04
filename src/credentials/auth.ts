/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as localizedText from '../shared/localizedText'
import { Credentials } from '@aws-sdk/types'
import { SsoAccessTokenProvider } from './sso/ssoAccessTokenProvider'
import { getIcon } from '../shared/icons'
import { Commands } from '../shared/vscode/commands2'
import { showQuickPick } from '../shared/ui/pickerPrompter'
import { isValidResponse } from '../shared/wizards/wizard'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError, UnknownError } from '../shared/errors'
import { getCache } from './sso/cache'
import { createFactoryFunction, Mutable } from '../shared/utilities/tsUtils'
import { SsoToken } from './sso/model'
import { SsoClient } from './sso/clients'
import { getLogger } from '../shared/logger'

export interface SsoConnection {
    readonly type: 'sso'
    readonly id: string
    readonly label: string
    readonly startUrl: string
    readonly scopes?: string[]

    /**
     * Retrieves a bearer token, refreshing or re-authenticating as-needed.
     *
     * This should be called for each new API request sent. It is up to the caller to
     * handle cases where the service rejects the token.
     */
    getToken(): Promise<Pick<SsoToken, 'accessToken' | 'expiresAt'>>
}

export interface IamConnection {
    readonly type: 'iam'
    readonly id: string
    readonly label: string
    getCredentials(): Promise<Credentials>
}

export type Connection = IamConnection | SsoConnection

export interface SsoProfile {
    readonly type: 'sso'
    readonly ssoRegion: string
    readonly startUrl: string
    readonly scopes?: string[]
}

// Placeholder type.
// Would be expanded over time to support
// https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html
type Profile = SsoProfile

interface AuthService {
    /**
     * Lists all connections known to the Toolkit.
     */
    listConnections(): Promise<Connection[]>

    /**
     * Creates a new connection using a profile.
     *
     * This will fail if the profile does not result in a valid connection.
     */
    createConnection(profile: Profile): Promise<Connection>

    /**
     * Deletes the connection, removing all associated stateful resources.
     */
    deleteConnection(connection: Pick<Connection, 'id'>): void

    /**
     * Retrieves a connection from an id if it exists.
     *
     * A connection id can be persisted and then later used to restore a previous connection.
     * The caller is expected to handle the case where the connection no longer exists.
     */
    getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined>
}

interface ConnectionManager {
    /**
     * The 'global' connection currently in use by the Toolkit.
     *
     * Connections can still be used even if they are not the active connection.
     */
    readonly activeConnection: Connection | undefined
    readonly onDidChangeActiveConnection: vscode.Event<Connection | undefined>

    /**
     * Changes the current 'active' connection used by the Toolkit.
     *
     * The user may be prompted if the connection is no longer valid.
     */
    useConnection(connection: Pick<Connection, 'id'>): Promise<Connection>
}

interface ProfileMetadata {
    /**
     * Labels are used for anything UI related when present.
     */
    readonly label?: string

    /**
     * Used to differentiate various edge-cases that are based off state or state transitions:
     * * `unauthenticated` -> try to login
     * * `valid` -> `invalid` -> notify that the credentials are invalid, prompt to login again
     * * `invalid` -> `invalid` -> immediately throw to stop the user from being spammed
     */
    readonly connectionState: 'valid' | 'invalid' | 'unauthenticated' // 'authenticating'
}

type StoredProfile<T extends Profile = Profile> = T & { readonly metadata: ProfileMetadata }

export class ProfileStore {
    public constructor(private readonly memento: vscode.Memento) {}

    public getProfile(id: string): StoredProfile | undefined {
        return this.getData()[id]
    }

    public getProfileOrThrow(id: string): StoredProfile {
        const profile = this.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Profile does not exist: ${id}`)
        }

        return profile
    }

    public listProfiles(): [id: string, profile: StoredProfile][] {
        return Object.entries(this.getData())
    }

    public async addProfile(id: string, profile: Profile): Promise<StoredProfile> {
        if (this.getProfile(id) !== undefined) {
            throw new Error(`Profile already exists: ${id}`)
        }

        return this.putProfile(id, this.initMetadata(profile))
    }

    public async updateProfile(id: string, metadata: Partial<ProfileMetadata>): Promise<StoredProfile> {
        const profile = this.getProfileOrThrow(id)

        return this.putProfile(id, { ...profile, metadata: { ...profile.metadata, ...metadata } })
    }

    public async deleteProfile(id: string): Promise<void> {
        const data = this.getData()
        delete (data as Mutable<typeof data>)[id]

        await this.updateData(data)
    }

    public getCurrentProfileId(): string | undefined {
        return this.memento.get<string>('auth.currentProfileId')
    }

    public async setCurrentProfileId(id: string | undefined): Promise<void> {
        await this.memento.update('auth.currentProfileId', id)
    }

    private getData() {
        return this.memento.get<{ readonly [id: string]: StoredProfile }>('auth.profiles', {})
    }

    private async updateData(state: { readonly [id: string]: StoredProfile | undefined }) {
        await this.memento.update('auth.profiles', state)
    }

    private async putProfile(id: string, profile: StoredProfile) {
        await this.updateData({ ...this.getData(), [id]: profile })

        return profile
    }

    private initMetadata(profile: Profile): StoredProfile {
        return {
            ...profile,
            metadata: {
                connectionState: 'unauthenticated',
            },
        }
    }
}

function keyedDebounce<T, U extends any[], K extends string = string>(
    fn: (key: K, ...args: U) => Promise<T>
): typeof fn {
    const pending = new Map<K, Promise<T>>()

    return (key, ...args) => {
        if (pending.has(key)) {
            return pending.get(key)!
        }

        const promise = fn(key, ...args).finally(() => pending.delete(key))
        pending.set(key, promise)

        return promise
    }
}

// TODO: replace this with `idToken` when available
export function getSsoProfileKey(profile: Pick<SsoProfile, 'startUrl' | 'scopes'>): string {
    const scopesFragment = profile.scopes ? `?scopes=${profile.scopes.sort()}` : ''

    return `${profile.startUrl}${scopesFragment}`
}

function sortProfilesByScope(profiles: StoredProfile<Profile>[]): StoredProfile<SsoProfile>[] {
    return profiles
        .filter((c): c is StoredProfile<SsoProfile> => c.type === 'sso')
        .sort((a, b) => (a.scopes?.length ?? 0) - (b.scopes?.length ?? 0))
}

// The true connection state can only be known after trying to use the connection
// So it is not exposed on the `Connection` interface
type StatefulConnection = Connection & { readonly state: ProfileMetadata['connectionState'] }

export class Auth implements AuthService, ConnectionManager {
    private readonly ssoCache = getCache()
    private readonly onDidChangeActiveConnectionEmitter = new vscode.EventEmitter<StatefulConnection | undefined>()
    public readonly onDidChangeActiveConnection = this.onDidChangeActiveConnectionEmitter.event

    public constructor(
        private readonly store: ProfileStore,
        private readonly createTokenProvider = createFactoryFunction(SsoAccessTokenProvider)
    ) {
        // TODO: do this lazily
        this.restorePreviousSession().catch(err => {
            getLogger().warn(`auth: failed to restore previous session: ${UnknownError.cast(err).message}`)
        })
    }

    #activeConnection: Mutable<StatefulConnection> | undefined
    public get activeConnection(): StatefulConnection | undefined {
        return this.#activeConnection
    }

    public async restorePreviousSession(): Promise<void> {
        const id = this.store.getCurrentProfileId()
        if (id === undefined) {
            return
        }

        await this.setActiveConnection(id)
    }

    public async useConnection({ id }: Pick<Connection, 'id'>): Promise<Connection> {
        const conn = await this.setActiveConnection(id)
        if (conn.state !== 'valid') {
            await this.updateConnectionState(id, 'unauthenticated')
            if (conn.type === 'sso') {
                await conn.getToken()
            }
        }

        return conn
    }

    private async setActiveConnection(id: Connection['id']): Promise<StatefulConnection> {
        const profile = this.store.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Connection does not exist: ${id}`)
        }

        const validated = await this.validateConnection(id, profile)
        const conn = (this.#activeConnection = this.getSsoConnection(id, validated))
        this.onDidChangeActiveConnectionEmitter.fire(conn)
        await this.store.setCurrentProfileId(id)

        return conn
    }

    public async logout(): Promise<void> {
        if (this.activeConnection === undefined) {
            return
        }

        await this.store.setCurrentProfileId(undefined)
        await this.invalidateConnection(this.activeConnection.id)
        this.#activeConnection = undefined
        this.onDidChangeActiveConnectionEmitter.fire(undefined)
    }

    public async listConnections(): Promise<Connection[]> {
        return this.store.listProfiles().map(([id, profile]) => this.getSsoConnection(id, profile))
    }

    // XXX: Used to combined scoped connections with the same startUrl into a single one
    public async listMergedConnections(): Promise<Connection[]> {
        return Array.from(
            this.store
                .listProfiles()
                .filter((data): data is [string, StoredProfile<SsoProfile>] => data[1].type === 'sso')
                .sort((a, b) => (a[1].scopes?.length ?? 0) - (b[1].scopes?.length ?? 0))
                .reduce(
                    (r, [id, profile]) => (r.set(profile.startUrl, this.getSsoConnection(id, profile)), r),
                    new Map<string, Connection>()
                )
                .values()
        )
    }

    public async createConnection(profile: SsoProfile): Promise<SsoConnection>
    public async createConnection(profile: Profile): Promise<Connection> {
        // XXX: Scoped connections must be shared as a workaround
        if (profile.scopes) {
            const sharedProfile = sortProfilesByScope(this.store.listProfiles().map(p => p[1])).find(
                p => p.startUrl === profile.startUrl
            )
            const scopes = Array.from(new Set([...profile.scopes, ...(sharedProfile?.scopes ?? [])]))
            profile = sharedProfile ? { ...profile, scopes } : profile
        }

        // XXX: `id` should be based off the resolved `idToken`, _not_ the source profile
        const id = getSsoProfileKey(profile)
        const storedProfile = await this.store.addProfile(id, profile)
        const conn = this.getSsoConnection(id, storedProfile)

        try {
            await conn.getToken()
        } catch (err) {
            await this.store.deleteProfile(id)
            throw err
        }

        return this.getSsoConnection(id, storedProfile)
    }

    public async deleteConnection(connection: Pick<Connection, 'id'>): Promise<void> {
        if (connection.id === this.#activeConnection?.id) {
            await this.logout()
        } else {
            this.invalidateConnection(connection.id)
        }

        await this.store.deleteProfile(connection.id)
    }

    public async getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined> {
        const connections = await this.listConnections()

        return connections.find(c => c.id === connection.id)
    }

    /**
     * Attempts to remove all auth state related to the connection.
     *
     * For SSO, this involves an API call to clear server-side state. The call happens
     * before the local token(s) are cleared as they are needed in the request.
     */
    private async invalidateConnection(id: Connection['id']) {
        const profile = this.store.getProfileOrThrow(id)

        if (profile.type === 'sso') {
            const provider = this.getTokenProvider(id, profile)
            const client = SsoClient.create(profile.ssoRegion, provider)

            // TODO: this seems to fail on the backend for scoped tokens
            await client.logout().catch(err => {
                const name = profile.metadata.label ?? id
                getLogger().warn(`auth: failed to logout of connection "${name}": ${UnknownError.cast(err)}`)
            })

            return provider.invalidate()
        }
    }

    private async updateConnectionState(id: Connection['id'], connectionState: ProfileMetadata['connectionState']) {
        const profile = await this.store.updateProfile(id, { connectionState })

        if (this.#activeConnection) {
            this.#activeConnection.state = connectionState
            this.onDidChangeActiveConnectionEmitter.fire(this.#activeConnection)
        }

        return profile
    }

    private async validateConnection(id: Connection['id'], profile: StoredProfile) {
        const provider = this.getTokenProvider(id, profile)
        if (profile.metadata.connectionState === 'valid' && (await provider.getToken()) === undefined) {
            return this.updateConnectionState(id, 'invalid')
        }

        return profile
    }

    private getTokenProvider(id: Connection['id'], profile: StoredProfile<SsoProfile>) {
        return this.createTokenProvider(
            {
                identifier: id,
                startUrl: profile.startUrl,
                scopes: profile.scopes,
                region: profile.ssoRegion,
            },
            this.ssoCache
        )
    }

    private getSsoConnection(
        id: Connection['id'],
        profile: StoredProfile<SsoProfile>
    ): SsoConnection & StatefulConnection {
        const provider = this.getTokenProvider(id, profile)

        return {
            id,
            type: profile.type,
            scopes: profile.scopes,
            startUrl: profile.startUrl,
            state: profile.metadata.connectionState,
            label: profile.metadata?.label ?? `SSO (${profile.startUrl})`,
            getToken: () => this.debouncedGetToken(id, provider),
        }
    }

    private readonly debouncedGetToken = keyedDebounce(Auth.prototype.getToken.bind(this))
    private async getToken(id: Connection['id'], provider: SsoAccessTokenProvider): Promise<SsoToken> {
        const token = await provider.getToken()

        return token ?? this.handleInvalidCredentials(id, () => provider.createToken())
    }

    // TODO: split into 'promptInvalidCredentials' and 'authenticate' methods
    private async handleInvalidCredentials<T>(id: Connection['id'], refresh: () => Promise<T>): Promise<T> {
        const previousState = this.store.getProfile(id)?.metadata.connectionState
        await this.updateConnectionState(id, 'invalid')

        if (previousState === 'invalid') {
            throw new ToolkitError('Credentials are invalid or expired. Try logging in again.', {
                code: 'InvalidCredentials',
            })
        }

        if (previousState === 'valid') {
            const message = localize('aws.auth.invalidCredentials', 'Credentials are expired or invalid, login again?')
            const resp = await vscode.window.showInformationMessage(message, localizedText.yes, localizedText.no)
            if (resp !== localizedText.yes) {
                throw new ToolkitError('User cancelled login', {
                    cancelled: true,
                    code: 'InvalidCredentials',
                })
            }
        }

        const refreshed = await refresh()
        await this.updateConnectionState(id, 'valid')

        return refreshed
    }

    static #instance: Auth | undefined
    public static get instance() {
        return (this.#instance ??= new Auth(new ProfileStore(globals.context.globalState)))
    }
}

export async function promptLogin(auth: Auth) {
    const items = (async function () {
        const connections = await auth.listMergedConnections()

        return [...connections.map(c => ({ label: c.label, data: c }))]
    })()

    const resp = await showQuickPick(items, {
        title: localize('aws.auth.login.title', 'Select a connection'),
    })

    if (!isValidResponse(resp)) {
        throw new CancellationError('user')
    }

    await auth.useConnection(resp)
}

const loginCommand = Commands.register('aws.auth.login', promptLogin)
Commands.register('aws.auth.logout', () => Auth.instance.logout())

function mapEventType<T, U = void>(event: vscode.Event<T>, fn?: (val: T) => U): vscode.Event<U> {
    const emitter = new vscode.EventEmitter<U>()
    event(val => (fn ? emitter.fire(fn(val)) : emitter.fire(undefined as U)))

    return emitter.event
}

export class AuthNode {
    public readonly id = 'auth'
    public readonly onDidChangeTreeItem = mapEventType(this.resource.onDidChangeActiveConnection)

    public constructor(public readonly resource: Auth) {}

    public getTreeItem() {
        if (this.resource.activeConnection?.state === 'invalid') {
            return this.createBadConnectionItem()
        }

        const itemLabel =
            this.resource.activeConnection?.label !== undefined
                ? localize('aws.auth.node.connected', `Connected to {0}`, this.resource.activeConnection.label)
                : localize('aws.auth.node.selectConnection', 'Select a connection...')
        const item = new vscode.TreeItem(itemLabel)
        item.iconPath = getIcon('vscode-account')
        item.command = loginCommand.build(this.resource).asCommand({ title: 'Login' })
        item.contextValue = 'awsAuthNode'

        return item
    }

    private createBadConnectionItem() {
        const label = localize('aws.auth.node.invalid', 'Connection is invalid or expired')
        const item = new vscode.TreeItem(label)
        item.iconPath = getIcon('vscode-error')
        item.command = loginCommand.build(this.resource).asCommand({ title: 'Login' })

        return item
    }
}
