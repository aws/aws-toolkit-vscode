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
import { createQuickPick, DataQuickPickItem, showQuickPick } from '../shared/ui/pickerPrompter'
import { isValidResponse } from '../shared/wizards/wizard'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError, UnknownError } from '../shared/errors'
import { getCache } from './sso/cache'
import { createFactoryFunction, Mutable } from '../shared/utilities/tsUtils'
import { builderIdStartUrl, SsoToken } from './sso/model'
import { SsoClient } from './sso/clients'
import { getLogger } from '../shared/logger'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { asString, CredentialsProvider, fromString } from './providers/credentials'
import { once } from '../shared/utilities/functionUtils'
import { getResourceFromTreeNode } from '../shared/treeview/utils'
import { Instance } from '../shared/utilities/typeConstructors'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { createInputBox } from '../shared/ui/inputPrompter'
import { CredentialsSettings } from './credentialsUtilities'
import { telemetry } from '../shared/telemetry/telemetry'
import { createCommonButtons, createExitButton, createHelpButton, createRefreshButton } from '../shared/ui/buttons'
import { getIdeProperties, isCloud9 } from '../shared/extensionUtilities'
import { getCodeCatalystDevEnvId } from '../shared/vscode/env'
import { getConfigFilename } from './sharedCredentials'
import { authHelpUrl } from '../shared/constants'
import { getDependentAuths } from './secondaryAuth'

export const ssoScope = 'sso:account:access'
export const codecatalystScopes = ['codecatalyst:read_write']
export const ssoAccountAccessScopes = ['sso:account:access']
export const codewhispererScopes = ['codewhisperer:completions', 'codewhisperer:analysis']

export function createBuilderIdProfile(): SsoProfile & { readonly scopes: string[] } {
    return {
        type: 'sso',
        ssoRegion: 'us-east-1',
        startUrl: builderIdStartUrl,
        scopes: [...codecatalystScopes, ...codewhispererScopes],
    }
}

export function createSsoProfile(startUrl: string, region = 'us-east-1'): SsoProfile & { readonly scopes: string[] } {
    return {
        type: 'sso',
        startUrl,
        ssoRegion: region,
        scopes: codewhispererScopes,
    }
}

export function hasScopes(target: SsoConnection | SsoProfile, scopes: string[]): boolean {
    return scopes?.every(s => target.scopes?.includes(s))
}

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
export type StatefulConnection = Connection & { readonly state: ProfileMetadata['connectionState'] }

interface ConnectionStateChangeEvent {
    readonly id: Connection['id']
    readonly state: ProfileMetadata['connectionState']
}

export class Auth implements AuthService, ConnectionManager {
    private readonly ssoCache = getCache()
    readonly #onDidChangeActiveConnection = new vscode.EventEmitter<StatefulConnection | undefined>()
    readonly #onDidChangeConnectionState = new vscode.EventEmitter<ConnectionStateChangeEvent>()
    public readonly onDidChangeActiveConnection = this.#onDidChangeActiveConnection.event
    public readonly onDidChangeConnectionState = this.#onDidChangeConnectionState.event

    public constructor(
        private readonly store: ProfileStore,
        private readonly createTokenProvider = createFactoryFunction(SsoAccessTokenProvider),
        private readonly iamProfileProvider = CredentialsProviderManager.getInstance()
    ) {}

    #activeConnection: Mutable<StatefulConnection> | undefined
    public get activeConnection(): StatefulConnection | undefined {
        return this.#activeConnection
    }

    public get hasConnections() {
        return this.store.listProfiles().length !== 0
    }

    public async restorePreviousSession(): Promise<Connection | undefined> {
        const id = this.store.getCurrentProfileId()
        if (id === undefined) {
            return
        }

        try {
            return await this.useConnection({ id })
        } catch (err) {
            getLogger().warn(`auth: failed to restore previous session: %s`, err)
        }
    }

    public async reauthenticate({ id }: Pick<SsoConnection, 'id'>): Promise<SsoConnection>
    public async reauthenticate({ id }: Pick<IamConnection, 'id'>): Promise<IamConnection>
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

    public async useConnection({ id }: Pick<SsoConnection, 'id'>): Promise<SsoConnection>
    public async useConnection({ id }: Pick<IamConnection, 'id'>): Promise<IamConnection>
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
        this.#onDidChangeActiveConnection.fire(conn)
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
        this.#onDidChangeActiveConnection.fire(undefined)
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
        const tokenProvider = this.getTokenProvider(id, {
            ...profile,
            metadata: { connectionState: 'unauthenticated' },
        })

        try {
            ;(await tokenProvider.getToken()) ?? (await tokenProvider.createToken())
            const storedProfile = await this.store.addProfile(id, profile)
            await this.updateConnectionState(id, 'valid')

            return this.getSsoConnection(id, storedProfile)
        } catch (err) {
            await this.store.deleteProfile(id)
            throw err
        }
    }

    public async deleteConnection(connection: Pick<Connection, 'id'>): Promise<void> {
        if (connection.id === this.#activeConnection?.id) {
            await this.logout()
        } else {
            await this.invalidateConnection(connection.id)
        }

        await this.store.deleteProfile(connection.id)
    }

    public async getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined> {
        const connections = await this.listConnections()

        return connections.find(c => c.id === connection.id)
    }

    public getConnectionState(connection: Pick<Connection, 'id'>): StatefulConnection['state'] | undefined {
        return this.store.getProfile(connection.id)?.metadata.connectionState
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
                getLogger().warn(`auth: failed to logout of connection "${name}": %s`, err)
            })

            return provider.invalidate()
        } else if (profile.type === 'iam') {
            globals.loginManager.store.invalidateCredentials(fromString(id))
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
            this.#onDidChangeActiveConnection.fire(this.#activeConnection)
        }
        this.#onDidChangeConnectionState.fire({ id, state: connectionState })

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

    // XXX: always read from the same location in a dev environment
    private getSsoSessionName = once(() => {
        try {
            const configFile = getConfigFilename()
            const contents: string = require('fs').readFileSync(configFile, 'utf-8')
            const identifier = contents.match(/\[sso\-session (.*)\]/)?.[1]
            if (!identifier) {
                throw new ToolkitError('No sso-session name found in ~/.aws/config', { code: 'NoSsoSessionName' })
            }

            return identifier
        } catch (err) {
            const defaultName = 'codecatalyst'
            getLogger().warn(`auth: unable to get an sso session name, defaulting to "${defaultName}": %s`, err)

            return defaultName
        }
    })

    private getTokenProvider(id: Connection['id'], profile: StoredProfile<SsoProfile>) {
        const shouldUseSoftwareStatement =
            getCodeCatalystDevEnvId() !== undefined && profile.startUrl === builderIdStartUrl

        const tokenIdentifier = shouldUseSoftwareStatement ? this.getSsoSessionName() : id

        return this.createTokenProvider(
            {
                identifier: tokenIdentifier,
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
            getCredentials: () => this.getCredentials(id, provider),
        }
    }

    private getSsoConnection(
        id: Connection['id'],
        profile: StoredProfile<SsoProfile>
    ): SsoConnection & StatefulConnection {
        const provider = this.getTokenProvider(id, profile)
        const truncatedUrl = profile.startUrl.match(/https?:\/\/(.*)\.awsapps\.com\/start/)?.[1] ?? profile.startUrl
        const label =
            profile.startUrl === builderIdStartUrl
                ? localizedText.builderId()
                : `${localizedText.iamIdentityCenter} (${truncatedUrl})`

        return {
            id,
            type: profile.type,
            scopes: profile.scopes,
            startUrl: profile.startUrl,
            state: profile.metadata.connectionState,
            label: profile.metadata?.label ?? label,
            getToken: () => this.getToken(id, provider),
        }
    }

    private readonly authenticate = keyedDebounce(this._authenticate.bind(this))
    private async _authenticate<T>(id: Connection['id'], callback: () => Promise<T>): Promise<T> {
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
        globals.loginManager.store.invalidateCredentials(providerId)
        const { credentials } = await globals.loginManager.store.upsertCredentials(providerId, provider)
        await globals.loginManager.validateCredentials(credentials, provider.getDefaultRegion())

        return credentials
    }

    private async getCachedCredentials(provider: CredentialsProvider) {
        const creds = await globals.loginManager.store.getCredentials(provider.getCredentialsId())
        if (creds !== undefined && creds.credentialsHashCode === provider.getHashCode()) {
            return creds.credentials
        }
    }

    private readonly getToken = keyedDebounce(this._getToken.bind(this))
    private async _getToken(id: Connection['id'], provider: SsoAccessTokenProvider): Promise<SsoToken> {
        const token = await provider.getToken()

        return token ?? this.handleInvalidCredentials(id, () => provider.createToken())
    }

    private readonly getCredentials = keyedDebounce(this._getCredentials.bind(this))
    private async _getCredentials(id: Connection['id'], provider: CredentialsProvider): Promise<Credentials> {
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
        // TODO: cancellable notification?
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

        // Use the environment token if available
        if (getCodeCatalystDevEnvId() !== undefined) {
            const profile = createBuilderIdProfile()
            const key = getSsoProfileKey(profile)
            if (this.store.getProfile(key) === undefined) {
                await this.store.addProfile(key, profile)
            }
            await this.store.setCurrentProfileId(key)
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
                getLogger().warn(`auth: failed to auto-connect using "${id}": %s`, err)
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

export async function promptForConnection(auth: Auth, type?: 'iam' | 'sso') {
    const resp = await createConnectionPrompter(auth, type).prompt()
    if (!isValidResponse(resp)) {
        throw new CancellationError('user')
    }

    if (resp === 'addNewConnection') {
        return addConnection.execute()
    }

    if (resp === 'editCredentials') {
        return globals.awsContextCommands.onCommandEditCredentials()
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
    telemetry.ui_click.emit({ elementId: 'devtools_connectToAws' })

    if (auth instanceof Auth) {
        return promptAndUseConnection(auth)
    } else {
        return promptAndUseConnection(getResourceFromTreeNode(auth, Instance(Auth)))
    }
})

async function signout(auth: Auth, conn: Connection | undefined = auth.activeConnection) {
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

export const createBuilderIdItem = () =>
    ({
        label: codicon`${getIcon('vscode-person')} ${localize(
            'aws.auth.builderIdItem.label',
            'Use a personal email to sign up and sign in with {0}',
            localizedText.builderId()
        )}`,
        data: 'builderId',
        onClick: () => telemetry.ui_click.emit({ elementId: 'connection_optionBuilderID' }),
        detail: `${localizedText.builderId()} is a new, personal profile for builders.`, // TODO: need a "Learn more" button ?
    } as DataQuickPickItem<'builderId'>)

export const createSsoItem = () =>
    ({
        label: codicon`${getIcon('vscode-organization')} ${localize(
            'aws.auth.ssoItem.label',
            'Connect using {0} {1}',
            getIdeProperties().company,
            localizedText.iamIdentityCenter
        )}`,
        data: 'sso',
        onClick: () => telemetry.ui_click.emit({ elementId: 'connection_optionSSO' }),
        detail: `Sign in to your company's ${localizedText.iamIdentityCenter} access portal login page.`,
    } as DataQuickPickItem<'sso'>)

export const createIamItem = () =>
    ({
        label: codicon`${getIcon('vscode-key')} ${localize('aws.auth.iamItem.label', 'Use IAM Credentials')}`,
        data: 'iam',
        onClick: () => telemetry.ui_click.emit({ elementId: 'connection_optionIAM' }),
        detail: 'Activates working with resources in the Explorer. Not supported by CodeWhisperer. Requires an access key ID and secret access key.',
    } as DataQuickPickItem<'iam'>)

export const isIamConnection = (conn?: Connection): conn is IamConnection => conn?.type === 'iam'
export const isSsoConnection = (conn?: Connection): conn is SsoConnection => conn?.type === 'sso'
export const isBuilderIdConnection = (conn?: Connection): conn is SsoConnection =>
    isSsoConnection(conn) && conn.startUrl === builderIdStartUrl

export async function createStartUrlPrompter(title: string, ignoreScopes = true) {
    const existingConnections = (await Auth.instance.listConnections()).filter(isSsoConnection)
    const requiredScopes = createSsoProfile('').scopes

    function validateSsoUrl(url: string) {
        if (!url.match(/^(http|https):\/\//i)) {
            return 'URLs must start with http:// or https://. Example: https://d-xxxxxxxxxx.awsapps.com/start'
        }

        try {
            const uri = vscode.Uri.parse(url, true)
            const isSameAuthority = (a: vscode.Uri, b: vscode.Uri) =>
                a.authority.toLowerCase() === b.authority.toLowerCase()
            const oldConn = existingConnections.find(conn => isSameAuthority(vscode.Uri.parse(conn.startUrl), uri))

            if (oldConn && (ignoreScopes || hasScopes(oldConn, requiredScopes))) {
                return 'A connection for this start URL already exists. Sign out before creating a new one.'
            }
        } catch (err) {
            return `URL is malformed: ${UnknownError.cast(err).message}`
        }
    }

    return createInputBox({
        title: `${title}: Enter Start URL`,
        placeholder: `Enter start URL for your organization's IAM Identity Center`,
        buttons: [createHelpButton(), createExitButton()],
        validateInput: validateSsoUrl,
    })
}

export async function createBuilderIdConnection(auth: Auth) {
    const newProfile = createBuilderIdProfile()
    const existingConn = (await auth.listConnections()).find(isBuilderIdConnection)
    if (!existingConn) {
        return auth.createConnection(newProfile)
    }

    const userResponse = await promptLogoutExistingBuilderIdConnection()
    if (userResponse !== 'signout') {
        throw new CancellationError('user')
    }

    await signout(auth, existingConn)

    return auth.createConnection(newProfile)
}

/**
 * Prompts the user to log out of an existing Builder ID connection.
 *
 * @returns The name of the action performed by the user
 */
async function promptLogoutExistingBuilderIdConnection(): Promise<'signout' | 'cancel'> {
    const items: DataQuickPickItem<'signout' | 'cancel'>[] = [
        {
            data: 'signout',
            label: `Currently signed in with ${getIdeProperties().company} Builder ID. Sign out to add another?`,
            detail: `This will sign out of your current ${
                getIdeProperties().company
            } Builder ID and open the sign-in page in browser.`,
        },
        { data: 'cancel', label: 'Cancel' },
    ]
    const resp = await showQuickPick(items, {
        title: `Sign in to different ${getIdeProperties().company} Builder ID`,
        buttons: createCommonButtons() as vscode.QuickInputButton[],
    })

    return resp === undefined ? 'cancel' : resp
}

Commands.register('aws.auth.help', async () => {
    vscode.env.openExternal(vscode.Uri.parse(authHelpUrl))
    telemetry.aws_help.emit()
})

Commands.register('aws.auth.signout', () => {
    telemetry.ui_click.emit({ elementId: 'devtools_signout' })
    return signout(Auth.instance)
})

const addConnection = Commands.register('aws.auth.addConnection', async () => {
    const c9IamItem = createIamItem()
    c9IamItem.detail =
        'Activates working with resources in the Explorer. Requires an access key ID and secret access key.'
    const items = isCloud9() ? [createSsoItem(), c9IamItem] : [createBuilderIdItem(), createSsoItem(), createIamItem()]

    const resp = await showQuickPick(items, {
        title: localize('aws.auth.addConnection.title', 'Add a Connection to {0}', getIdeProperties().company),
        placeholder: localize('aws.auth.addConnection.placeholder', 'Select a connection option'),
        buttons: createCommonButtons() as vscode.QuickInputButton[],
    })
    if (!isValidResponse(resp)) {
        telemetry.ui_click.emit({ elementId: 'connection_optionescapecancel' })
        throw new CancellationError('user')
    }

    switch (resp) {
        case 'iam':
            return await globals.awsContextCommands.onCommandCreateCredentialsProfile()
        case 'sso': {
            const startUrlPrompter = await createStartUrlPrompter('IAM Identity Center')
            const startUrl = await startUrlPrompter.prompt()
            if (!isValidResponse(startUrl)) {
                throw new CancellationError('user')
            }

            telemetry.ui_click.emit({ elementId: 'connection_startUrl' })

            const conn = await Auth.instance.createConnection(createSsoProfile(startUrl))
            return Auth.instance.useConnection(conn)
        }
        case 'builderId': {
            return createBuilderIdConnection(Auth.instance)
        }
    }
})

const getConnectionIcon = (conn: Connection) =>
    conn.type === 'sso' ? getIcon('vscode-account') : getIcon('vscode-key')

export function createConnectionPrompter(auth: Auth, type?: 'iam' | 'sso') {
    const placeholder =
        type === 'iam'
            ? localize('aws.auth.promptConnection.iam.placeholder', 'Select an IAM credential')
            : localize('aws.auth.promptConnection.all.placeholder', 'Select a connection')

    const refreshButton = createRefreshButton()
    refreshButton.onClick = () => void prompter.clearAndLoadItems(loadItems())

    const prompter = createQuickPick(loadItems(), {
        placeholder,
        title: localize('aws.auth.promptConnection.title', 'Switch Connection'),
        buttons: [refreshButton, createExitButton()],
    })

    return prompter

    async function loadItems(): Promise<DataQuickPickItem<Connection | 'addNewConnection' | 'editCredentials'>[]> {
        const addNewConnection = {
            label: codicon`${getIcon('vscode-plus')} Add New Connection`,
            data: 'addNewConnection' as const,
        }
        const editCredentials = {
            label: codicon`${getIcon('vscode-pencil')} Edit Credentials`,
            data: 'editCredentials' as const,
        }

        // TODO: list linked connections
        const connections = await auth.listConnections()

        // Sort 'sso' connections first, then valid connections, then by label
        const sortByState = (a: Connection, b: Connection) => {
            const stateA = auth.getConnectionState(a)
            const stateB = auth.getConnectionState(b)

            return stateA === stateB
                ? a.label.localeCompare(b.label)
                : stateA === 'valid'
                ? -1
                : stateB === 'valid'
                ? 1
                : 0
        }
        connections.sort((a, b) =>
            a.type === b.type ? sortByState(a, b) : a.type === 'sso' ? -1 : b.type === 'sso' ? 1 : 0
        )

        const filtered = type !== undefined ? connections.filter(c => c.type === type) : connections
        const items = [...filtered.map(toPickerItem), addNewConnection]
        const canShowEdit = connections.filter(isIamConnection).filter(c => c.label.startsWith('profile')).length > 0

        return canShowEdit ? [...items, editCredentials] : items
    }

    function toPickerItem(conn: Connection): DataQuickPickItem<Connection> {
        const state = auth.getConnectionState(conn)
        if (state !== 'valid') {
            return {
                data: conn,
                invalidSelection: true,
                label: codicon`${getIcon('vscode-error')} ${conn.label}`,
                description:
                    state === 'authenticating'
                        ? 'authenticating...'
                        : localize(
                              'aws.auth.promptConnection.expired.description',
                              'Expired or Invalid, select to authenticate'
                          ),
                onClick:
                    state !== 'authenticating'
                        ? async () => {
                              // XXX: this is hack because only 1 picker can be shown at a time
                              // Some legacy auth providers will show a picker, hiding this one
                              // If we detect this then we'll jump straight into using the connection
                              let hidden = false
                              const sub = prompter.quickPick.onDidHide(() => {
                                  hidden = true
                                  sub.dispose()
                              })
                              const newConn = await reauthCommand.execute(auth, conn)
                              if (hidden && newConn && auth.getConnectionState(newConn) === 'valid') {
                                  await auth.useConnection(newConn)
                              } else {
                                  await prompter.clearAndLoadItems(loadItems())
                                  prompter.selectItems(
                                      ...prompter.quickPick.items.filter(i => i.label.includes(conn.label))
                                  )
                              }
                          }
                        : undefined,
            }
        }

        return {
            data: conn,
            label: codicon`${getConnectionIcon(conn)} ${conn.label}`,
            description: getConnectionDescription(conn),
        }
    }

    function getConnectionDescription(conn: Connection) {
        if (conn.type === 'iam') {
            const descSuffix = conn.id.startsWith('profile:')
                ? 'configured locally (~/.aws/config)'
                : 'sourced from the environment'

            return `IAM Credential, ${descSuffix}`
        }

        const toolAuths = getDependentAuths(conn)
        if (toolAuths.length === 0) {
            return undefined
        } else if (toolAuths.length === 1) {
            return `Connected to ${toolAuths[0].toolLabel}`
        } else {
            return `Connected to Dev Tools`
        }
    }
}

export const reauthCommand = Commands.register('_aws.auth.reauthenticate', async (auth: Auth, conn: Connection) => {
    try {
        return await auth.reauthenticate(conn)
    } catch (err) {
        throw ToolkitError.chain(err, 'Unable to authenticate connection')
    }
})

// Used to decouple from the `Commands` implementation
Commands.register('_aws.auth.autoConnect', () => Auth.instance.tryAutoConnect())

export const useIamCredentials = Commands.register('_aws.auth.useIamCredentials', (auth: Auth) => {
    telemetry.ui_click.emit({ elementId: 'explorer_IAMselect_VSCode' })

    return promptAndUseConnection(auth, 'iam')
})

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

    public getTreeItem() {
        // Calling this here is robust but `TreeShim` must be instantiated lazily to stop side-effects
        this.resource.tryAutoConnect()

        if (!this.resource.hasConnections) {
            const item = new vscode.TreeItem(`Connect to ${getIdeProperties().company} to Get Started...`)
            item.command = addConnection.build().asCommand({ title: 'Add Connection' })

            return item
        }

        const conn = this.resource.activeConnection
        const itemLabel =
            conn?.label !== undefined
                ? localize('aws.auth.node.connected', `Connected with {0}`, conn.label)
                : localize('aws.auth.node.selectConnection', 'Select a connection...')

        const item = new vscode.TreeItem(itemLabel)
        item.contextValue = 'awsAuthNode'

        if (conn !== undefined && conn.state !== 'valid') {
            item.iconPath = getIcon('vscode-error')
            if (conn.state === 'authenticating') {
                this.setDescription(item, 'authenticating...')
            } else {
                this.setDescription(item, 'expired or invalid, click to authenticate')
                item.command = reauthCommand.build(this.resource, conn).asCommand({ title: 'Reauthenticate' })
            }
        } else {
            item.command = switchConnections.build(this.resource).asCommand({ title: 'Login' })
            item.iconPath = conn !== undefined ? getConnectionIcon(conn) : undefined
        }

        return item
    }

    private setDescription(item: vscode.TreeItem, text: string) {
        if (isCloud9()) {
            item.tooltip = item.tooltip ?? text
        } else {
            item.description = text
        }
    }
}
