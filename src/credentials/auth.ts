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
import { codicon, getIcon } from '../shared/icons'
import { Commands } from '../shared/vscode/commands2'
import { DataQuickPickItem, showQuickPick } from '../shared/ui/pickerPrompter'
import { isValidResponse } from '../shared/wizards/wizard'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError, UnknownError } from '../shared/errors'
import { getCache } from './sso/cache'
import { createFactoryFunction, Mutable } from '../shared/utilities/tsUtils'
import { SsoToken } from './sso/model'
import { SsoClient } from './sso/clients'
import { getLogger } from '../shared/logger'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { asString, CredentialsProvider, fromString } from './providers/credentials'
import { once, shared } from '../shared/utilities/functionUtils'
import { getResourceFromTreeNode } from '../shared/treeview/utils'
import { Instance } from '../shared/utilities/typeConstructors'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { createInputBox } from '../shared/ui/inputPrompter'
import { CredentialsSettings } from './credentialsUtilities'
import { telemetry } from '../shared/telemetry/telemetry'
import { createCommonButtons } from '../shared/ui/buttons'
import { getIdeProperties } from '../shared/extensionUtilities'

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
    // Currently equivalent to a serialized `CredentialId`
    // This may change in the future after refactoring legacy implementations
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

export interface IamProfile {
    readonly type: 'iam'
    readonly name: string
}

// Placeholder type.
// Would be expanded over time to support
// https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html
type Profile = IamProfile | SsoProfile

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
    readonly connectionState: 'valid' | 'invalid' | 'unauthenticated' | 'authenticating'
}

// Difference between "Connection" vs. "Profile":
// * Profile - A stateless configuration that describes how to get credentials
// * Connection - A stateful entity that can produce credentials for a specific target
//
// Connections are very similar to credential providers used in existing logic. The distinction
// is that connections are (ideally) identity-orientated whereas credential providers are not.

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

    public async addProfile(id: string, profile: SsoProfile): Promise<StoredProfile<SsoProfile>>
    public async addProfile(id: string, profile: IamProfile): Promise<StoredProfile<IamProfile>>
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

async function loadIamProfilesIntoStore(store: ProfileStore, manager: CredentialsProviderManager) {
    const providers = await manager.getCredentialProviderNames()
    for (const [id, profile] of store.listProfiles()) {
        if (profile.type === 'iam' && providers[id] === undefined) {
            await store.deleteProfile(id)
        }
    }
    for (const id of Object.keys(providers)) {
        if (store.getProfile(id) === undefined) {
            await store.addProfile(id, { type: 'iam', name: providers[id].credentialTypeId })
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
        private readonly createTokenProvider = createFactoryFunction(SsoAccessTokenProvider),
        private readonly iamProfileProvider = CredentialsProviderManager.getInstance()
    ) {}

    #activeConnection: Mutable<StatefulConnection> | undefined
    public get activeConnection(): StatefulConnection | undefined {
        return this.#activeConnection
    }

    public async restorePreviousSession(): Promise<Connection | undefined> {
        const id = this.store.getCurrentProfileId()
        if (id === undefined) {
            return
        }

        try {
            return await this.useConnection({ id })
        } catch (err) {
            getLogger().warn(`auth: failed to restore previous session: ${UnknownError.cast(err).message}`)
        }
    }

    public async reauthenticate({ id }: Pick<Connection, 'id'>): Promise<Connection> {
        const profile = this.store.getProfileOrThrow(id)
        if (profile.type === 'sso') {
            const provider = this.getTokenProvider(id, profile)
            await this.authenticate(id, () => provider.createToken())

            return this.getSsoConnection(id, profile)
        } else {
            const provider = await this.getCredentialsProvider(id)
            await this.authenticate(id, () => this.createCachedCredentials(provider))

            return this.getIamConnection(id, provider)
        }
    }

    public async useConnection({ id }: Pick<Connection, 'id'>): Promise<Connection> {
        const profile = this.store.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Connection does not exist: ${id}`)
        }

        const validated = await this.validateConnection(id, profile)
        const conn =
            validated.type === 'sso'
                ? this.getSsoConnection(id, validated)
                : this.getIamConnection(id, await this.getCredentialsProvider(id))

        this.#activeConnection = conn
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
        await loadIamProfilesIntoStore(this.store, this.iamProfileProvider)

        const connections = await Promise.all(
            this.store.listProfiles().map(async ([id, profile]) => {
                if (profile.type === 'sso') {
                    return this.getSsoConnection(id, profile)
                } else {
                    return this.getIamConnection(id, await this.getCredentialsProvider(id))
                }
            })
        )

        return connections
    }

    public async createConnection(profile: SsoProfile): Promise<SsoConnection>
    public async createConnection(profile: Profile): Promise<Connection> {
        if (profile.type === 'iam') {
            throw new Error('Creating IAM connections is not supported')
        }

        // XXX: Scoped connections must be shared as a workaround
        const startUrl = profile.startUrl
        if (profile.scopes) {
            const sharedProfile = sortProfilesByScope(this.store.listProfiles().map(p => p[1])).find(
                p => p.startUrl === startUrl
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
        } else if (profile.type === 'iam') {
            globals.credentialsStore.invalidateCredentials(fromString(id))
        }
    }

    private async updateConnectionState(id: Connection['id'], connectionState: ProfileMetadata['connectionState']) {
        const oldProfile = this.store.getProfileOrThrow(id)
        if (oldProfile.metadata.connectionState === connectionState) {
            return oldProfile
        }

        const profile = await this.store.updateProfile(id, { connectionState })
        if (this.#activeConnection?.id === id) {
            this.#activeConnection.state = connectionState
            this.onDidChangeActiveConnectionEmitter.fire(this.#activeConnection)
        }

        return profile
    }

    private async validateConnection<T extends Profile>(id: Connection['id'], profile: StoredProfile<T>) {
        if (profile.type === 'sso') {
            const provider = this.getTokenProvider(id, profile)
            if ((await provider.getToken()) === undefined) {
                return this.updateConnectionState(id, 'invalid')
            } else {
                return this.updateConnectionState(id, 'valid')
            }
        } else {
            const provider = await this.getCredentialsProvider(id)
            try {
                const credentials = await this.getCachedCredentials(provider)
                if (credentials !== undefined) {
                    return this.updateConnectionState(id, 'valid')
                } else if ((await provider.canAutoConnect()) === true) {
                    await this.authenticate(id, () => this.createCachedCredentials(provider))

                    return this.store.getProfileOrThrow(id)
                } else {
                    return this.updateConnectionState(id, 'invalid')
                }
            } catch {
                return this.updateConnectionState(id, 'invalid')
            }
        }
    }

    private async getCredentialsProvider(id: Connection['id']) {
        const provider = await this.iamProfileProvider.getCredentialsProvider(fromString(id))
        if (provider === undefined) {
            throw new Error(`Credentials provider "${id}" not found`)
        }

        return provider
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

    private getIamConnection(id: Connection['id'], provider: CredentialsProvider): IamConnection & StatefulConnection {
        const profile = this.store.getProfileOrThrow(id)

        return {
            id,
            type: 'iam',
            state: profile.metadata.connectionState,
            label: profile.metadata.label ?? id,
            getCredentials: () => this.debouncedGetCredentials(id, provider),
        }
    }

    private getSsoConnection(
        id: Connection['id'],
        profile: StoredProfile<SsoProfile>
    ): SsoConnection & StatefulConnection {
        const provider = this.getTokenProvider(id, profile)
        const label = `SSO (${profile.startUrl})`

        return {
            id,
            type: profile.type,
            scopes: profile.scopes,
            startUrl: profile.startUrl,
            state: profile.metadata.connectionState,
            label: profile.metadata?.label ?? label,
            getToken: () => this.debouncedGetToken(id, provider),
        }
    }

    private async authenticate<T>(id: Connection['id'], callback: () => Promise<T>): Promise<T> {
        await this.updateConnectionState(id, 'authenticating')

        try {
            const result = await callback()
            await this.updateConnectionState(id, 'valid')

            return result
        } catch (err) {
            await this.updateConnectionState(id, 'invalid')
            throw err
        }
    }

    private async createCachedCredentials(provider: CredentialsProvider) {
        const providerId = provider.getCredentialsId()
        globals.credentialsStore.invalidateCredentials(providerId)
        const { credentials } = await globals.credentialsStore.upsertCredentials(providerId, provider)

        return credentials
    }

    private async getCachedCredentials(provider: CredentialsProvider) {
        const creds = await globals.credentialsStore.getCredentials(provider.getCredentialsId())
        if (creds !== undefined && creds.credentialsHashCode === provider.getHashCode()) {
            return creds.credentials
        }
    }

    private readonly debouncedGetToken = keyedDebounce(Auth.prototype.getToken.bind(this))
    private async getToken(id: Connection['id'], provider: SsoAccessTokenProvider): Promise<SsoToken> {
        const token = await provider.getToken()

        return token ?? this.handleInvalidCredentials(id, () => provider.createToken())
    }

    private readonly debouncedGetCredentials = keyedDebounce(Auth.prototype.getCredentials.bind(this))
    private async getCredentials(id: Connection['id'], provider: CredentialsProvider): Promise<Credentials> {
        const credentials = await this.getCachedCredentials(provider)
        if (credentials !== undefined) {
            return credentials
        } else if ((await provider.canAutoConnect()) === true) {
            return this.createCachedCredentials(provider)
        } else {
            return this.handleInvalidCredentials(id, () => this.createCachedCredentials(provider))
        }
    }

    private async handleInvalidCredentials<T>(id: Connection['id'], refresh: () => Promise<T>): Promise<T> {
        const previousState = this.store.getProfile(id)?.metadata.connectionState
        await this.updateConnectionState(id, 'invalid')

        if (previousState === 'invalid') {
            throw new ToolkitError('Connection is invalid or expired. Try logging in again.', {
                code: 'InvalidConnection',
            })
        }

        if (previousState === 'valid') {
            const message = localize('aws.auth.invalidConnection', 'Connection is invalid or expired, login again?')
            const resp = await vscode.window.showInformationMessage(message, localizedText.yes, localizedText.no)
            if (resp !== localizedText.yes) {
                throw new ToolkitError('User cancelled login', {
                    cancelled: true,
                    code: 'InvalidConnection',
                })
            }
        }

        return this.authenticate(id, refresh)
    }

    public readonly tryAutoConnect = once(async () => {
        if (this.activeConnection !== undefined) {
            return
        }

        const conn = await this.restorePreviousSession()
        if (conn !== undefined) {
            return
        }

        const defaultProfileId = asString({ credentialSource: 'profile', credentialTypeId: 'default' })
        const ec2ProfileId = asString({ credentialSource: 'ec2', credentialTypeId: 'instance' })
        const ecsProfileId = asString({ credentialSource: 'ecs', credentialTypeId: 'instance' })
        const legacyProfile = new CredentialsSettings().get('profile', defaultProfileId) || defaultProfileId
        const tryConnection = async (id: string) => {
            try {
                await this.useConnection({ id })
                return true
            } catch (err) {
                getLogger().warn(`auth: failed to auto-connect using "${id}": ${UnknownError.cast(err).message}`)
                return false
            }
        }

        await loadIamProfilesIntoStore(this.store, this.iamProfileProvider)
        for (const id of [ec2ProfileId, ecsProfileId, legacyProfile]) {
            if ((await tryConnection(id)) === true) {
                getLogger().info(`auth: automatically connected with "${id}"`)
                // Removes the setting from the UI
                if (id === legacyProfile) {
                    new CredentialsSettings().delete('profile')
                }
            }
        }
    })

    static #instance: Auth | undefined
    public static get instance() {
        return (this.#instance ??= new Auth(new ProfileStore(globals.context.globalState)))
    }
}

const getConnectionIcon = (conn: Connection) =>
    conn.type === 'sso' ? getIcon('vscode-account') : getIcon('vscode-key')

function toPickerItem(conn: Connection) {
    const label = codicon`${getConnectionIcon(conn)} ${conn.label}`
    const descPrefix = conn.type === 'iam' ? 'IAM Credential' : undefined
    const descSuffix = conn.id.startsWith('profile:')
        ? 'configured locally (~/.aws/config)'
        : 'sourced from the environment'

    return {
        label,
        data: conn,
        description: descPrefix !== undefined ? `${descPrefix}, ${descSuffix}` : undefined,
    }
}

export async function promptForConnection(auth: Auth, type?: 'iam' | 'sso') {
    const addNewConnection = {
        label: codicon`${getIcon('vscode-plus')} Add new connection`,
        data: 'addNewConnection' as const,
    }

    const items = (async function () {
        // TODO: list linked connections
        const connections = await auth.listConnections()
        connections.sort((a, b) => (a.type === 'sso' ? -1 : b.type === 'sso' ? 1 : a.label.localeCompare(b.label)))
        const filtered = type !== undefined ? connections.filter(c => c.type === type) : connections

        return [...filtered.map(toPickerItem), addNewConnection]
    })()

    const placeholder =
        type === 'iam'
            ? localize('aws.auth.promptConnection.iam.placeholder', 'Select an IAM credential')
            : localize('aws.auth.promptConnection.all.placeholder', 'Select a connection')

    const resp = await showQuickPick<Connection | 'addNewConnection'>(items, {
        placeholder,
        title: localize('aws.auth.promptConnection.title', 'Switch Connection'),
        buttons: createCommonButtons(),
    })

    if (!isValidResponse(resp)) {
        throw new CancellationError('user')
    }

    if (resp === 'addNewConnection') {
        return addConnection.execute()
    }

    return resp
}

export async function promptAndUseConnection(...[auth, type]: Parameters<typeof promptForConnection>) {
    return telemetry.aws_setCredentials.run(async span => {
        const resp = await promptForConnection(auth, type)
        if (!resp) {
            throw new CancellationError('user')
        }

        await auth.useConnection(resp)
    })
}

const switchConnections = Commands.register('aws.auth.switchConnections', (auth: Auth | unknown) => {
    if (auth instanceof Auth) {
        return promptAndUseConnection(auth)
    } else {
        return promptAndUseConnection(getResourceFromTreeNode(auth, Instance(Auth)))
    }
})

async function signout(auth: Auth) {
    const conn = auth.activeConnection

    if (conn?.type === 'sso') {
        // TODO: does deleting the connection make sense UX-wise?
        // this makes it disappear from the list of available connections
        await auth.deleteConnection(conn)

        const iamConnections = (await auth.listConnections()).filter(c => c.type === 'iam')
        const fallbackConn = iamConnections.find(c => c.id === 'profile:default') ?? iamConnections[0]
        if (fallbackConn !== undefined) {
            await auth.useConnection(fallbackConn)
        }
    } else {
        await auth.logout()

        const fallbackConn = (await auth.listConnections()).find(c => c.type === 'sso')
        if (fallbackConn !== undefined) {
            await auth.useConnection(fallbackConn)
        }
    }
}

export const createSsoItem = () =>
    ({
        label: codicon`${getIcon('vscode-organization')} ${localize(
            'aws.auth.ssoItem.label',
            'Connect using {0} IAM Identity Center',
            getIdeProperties().company
        )}`,
        data: 'sso',
        detail: "Sign in to your company's IAM Identity Center access portal login page.",
    } as DataQuickPickItem<'sso'>)

export const createIamItem = () =>
    ({
        label: codicon`${getIcon('vscode-key')} ${localize('aws.auth.iamItem.label', 'Enter IAM Credentials')}`,
        data: 'iam',
        detail: 'Activates working with resources in the Explorer. Not supported by CodeWhisperer. Requires an access key ID and secret access key.',
    } as DataQuickPickItem<'iam'>)

export const createStartUrlPrompter = (title: string) =>
    createInputBox({
        title: `${title}: Enter Start URL`,
        placeholder: 'https://d-xxxxxxxxxx.awsapps.com/start',
        buttons: createCommonButtons(),
    })

// TODO: add specific documentation URL
Commands.register('aws.auth.help', async () => (await Commands.get('aws.help'))?.execute())
Commands.register('aws.auth.signout', () => signout(Auth.instance))
const addConnection = Commands.register('aws.auth.addConnection', async () => {
    const resp = await showQuickPick([createSsoItem(), createIamItem()], {
        title: localize('aws.auth.addConnection.title', 'Add a Connection to {0}', getIdeProperties().company),
        placeholder: localize('aws.auth.addConnection.placeholder', 'Select a connection option'),
        buttons: createCommonButtons() as vscode.QuickInputButton[],
    })
    if (!isValidResponse(resp)) {
        throw new CancellationError('user')
    }

    switch (resp) {
        case 'iam':
            return await globals.awsContextCommands.onCommandCreateCredentialsProfile()
        case 'sso': {
            const startUrl = await createStartUrlPrompter('SSO Connection').prompt()
            if (!isValidResponse(startUrl)) {
                throw new CancellationError('user')
            }

            const conn = await Auth.instance.createConnection({
                type: 'sso',
                startUrl,
                ssoRegion: 'us-east-1',
            })

            return Auth.instance.useConnection(conn)
        }
    }
})

const reauth = Commands.register('_aws.auth.reauthenticate', async (auth: Auth, conn: Connection) => {
    try {
        await auth.reauthenticate(conn)
    } catch (err) {
        throw ToolkitError.chain(err, 'Unable to authenticate connection')
    }
})

// Used to decouple from the `Commands` implementation
Commands.register('_aws.auth.autoConnect', () => Auth.instance.tryAutoConnect())

export const useIamCredentials = Commands.register('_aws.auth.useIamCredentials', (auth: Auth) =>
    promptAndUseConnection(auth, 'iam')
)

// Legacy commands
export const login = Commands.register('aws.login', async (auth: Auth = Auth.instance) => {
    const connections = await auth.listConnections()
    if (connections.length === 0) {
        return addConnection.execute()
    } else {
        return switchConnections.execute(auth)
    }
})
Commands.register('aws.logout', () => signout(Auth.instance))
Commands.register('aws.credentials.edit', () => globals.awsContextCommands.onCommandEditCredentials())
Commands.register('aws.credentials.profile.create', async () => {
    try {
        await globals.awsContextCommands.onCommandCreateCredentialsProfile()
    } finally {
        telemetry.aws_createCredentials.emit()
    }
})

function mapEventType<T, U = void>(event: vscode.Event<T>, fn?: (val: T) => U): vscode.Event<U> {
    const emitter = new vscode.EventEmitter<U>()
    event(val => (fn ? emitter.fire(fn(val)) : emitter.fire(undefined as U)))

    return emitter.event
}

export class AuthNode implements TreeNode<Auth> {
    public readonly id = 'auth'
    public readonly onDidChangeTreeItem = mapEventType(this.resource.onDidChangeActiveConnection)

    public constructor(public readonly resource: Auth) {}

    // Guard against race conditions when rendering the node
    private listConnections = shared(() => this.resource.listConnections())
    public async getTreeItem() {
        // Calling this here is robust but `TreeShim` must be instantiated lazily to stop side-effects
        await this.resource.tryAutoConnect()

        const conn = this.resource.activeConnection
        if (conn === undefined && (await this.listConnections()).length === 0) {
            const item = new vscode.TreeItem(`Connect to ${getIdeProperties().company} to Get Started...`)
            item.command = addConnection.build().asCommand({ title: 'Add Connection' })

            return item
        }

        const itemLabel =
            conn?.label !== undefined
                ? localize('aws.auth.node.connected', `Connected with {0}`, conn.label)
                : localize('aws.auth.node.selectConnection', 'Select a connection...')

        const item = new vscode.TreeItem(itemLabel)
        item.contextValue = 'awsAuthNode'

        if (conn !== undefined && conn.state !== 'valid') {
            item.iconPath = getIcon('vscode-error')
            if (conn.state === 'authenticating') {
                item.description = 'authenticating...'
            } else {
                item.description = 'expired or invalid, click to authenticate'
                item.command = reauth.build(this.resource, conn).asCommand({ title: 'Reauthenticate' })
            }
        } else {
            item.command = switchConnections.build(this.resource).asCommand({ title: 'Login' })
            item.iconPath = conn !== undefined ? getConnectionIcon(conn) : undefined
        }

        return item
    }
}
