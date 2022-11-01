/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { ToolkitError } from '../shared/errors'
import { getCache } from './sso/cache'
import { createFactoryFunction, Mutable } from '../shared/utilities/tsUtils'
import { SsoToken } from './sso/model'
import globals from '../shared/extensionGlobals'

interface SsoConnection {
    readonly type: 'sso'
    readonly id: string
    readonly label: string
    readonly scopes?: string[]
    getToken(): Promise<Pick<SsoToken, 'accessToken' | 'expiresAt'>>
}

interface IamConnection {
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
    listConnections(): Promise<Connection[]>
    createConnection(profile: Profile): Promise<Connection>
    deleteConnection(connection: Pick<Connection, 'id'>): void
    getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined>
}

interface ConnectionManager {
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
    readonly connectionState: 'valid' | 'invalid' | 'unauthenticated'
}

type StoredProfile<T extends Profile = Profile> = T & { readonly metadata: ProfileMetadata }

export class ProfileStore {
    public constructor(private readonly memento: vscode.Memento) {}

    public getProfile(id: string): StoredProfile | undefined {
        return this.getData()[id]
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
        const profile = this.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Profile does not exist: ${id}`)
        }

        return this.putProfile(id, { ...profile, metadata: { ...profile.metadata, ...metadata } })
    }

    public async deleteProfile(id: string): Promise<void> {
        const data = this.getData()
        delete (data as Mutable<typeof data>)[id]

        await this.updateData(data)
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
    ) {}

    #activeConnection: Mutable<StatefulConnection> | undefined
    public get activeConnection(): StatefulConnection | undefined {
        return this.#activeConnection
    }

    public async useConnection({ id }: Pick<Connection, 'id'>): Promise<Connection> {
        const profile = this.store.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Connection does not exist: ${id}`)
        }

        const conn = this.createSsoConnection(id, profile)
        this.#activeConnection = conn

        if (conn.state !== 'valid') {
            await this.updateState(id, 'unauthenticated')
            await conn.getToken()
        } else {
            this.onDidChangeActiveConnectionEmitter.fire(conn)
        }

        return conn
    }

    public logout(): void {
        this.#activeConnection = undefined
        this.onDidChangeActiveConnectionEmitter.fire(undefined)
    }

    public async listConnections(): Promise<Connection[]> {
        return this.store.listProfiles().map(([id, profile]) => this.createSsoConnection(id, profile))
    }

    // XXX: Used to combined scoped connections with the same startUrl into a single one
    public async listMergedConnections(): Promise<Connection[]> {
        return Array.from(
            this.store
                .listProfiles()
                .filter((data): data is [string, StoredProfile<SsoProfile>] => data[1].type === 'sso')
                .sort((a, b) => (a[1].scopes?.length ?? 0) - (b[1].scopes?.length ?? 0))
                .reduce(
                    (r, [id, profile]) => (r.set(profile.startUrl, this.createSsoConnection(id, profile)), r),
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
        const conn = this.createSsoConnection(id, storedProfile)

        try {
            await conn.getToken()
        } catch (err) {
            await this.store.deleteProfile(id)
            throw err
        }

        return conn
    }

    public async deleteConnection(connection: Pick<Connection, 'id'>): Promise<void> {
        await this.store.deleteProfile(connection.id)
        if (connection.id === this.#activeConnection?.id) {
            this.logout()
        }
    }

    public async getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined> {
        const connections = await this.listConnections()

        return connections.find(c => c.id === connection.id)
    }

    private async updateState(id: Connection['id'], connectionState: ProfileMetadata['connectionState']) {
        const profile = await this.store.updateProfile(id, { connectionState })

        if (this.#activeConnection) {
            this.#activeConnection.state = connectionState
            this.onDidChangeActiveConnectionEmitter.fire(this.#activeConnection)
        }

        return profile
    }

    private createSsoConnection(
        id: Connection['id'],
        profile: StoredProfile<SsoProfile>
    ): SsoConnection & StatefulConnection {
        const provider = this.createTokenProvider(
            {
                identifier: id,
                startUrl: profile.startUrl,
                scopes: profile.scopes,
                region: profile.ssoRegion,
            },
            this.ssoCache
        )

        return {
            id,
            type: profile.type,
            scopes: profile.scopes,
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

    private async handleInvalidCredentials<T>(id: Connection['id'], refresh: () => Promise<T>): Promise<T> {
        const previousState = this.store.getProfile(id)?.metadata.connectionState
        await this.updateState(id, 'invalid')

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
        await this.updateState(id, 'valid')

        return refreshed
    }

    static #instance: Auth | undefined
    public static get instance() {
        return (this.#instance ??= new Auth(new ProfileStore(globals.context.globalState)))
    }
}

const loginCommand = Commands.register('aws.auth.login', async (auth: Auth) => {
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
})

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
