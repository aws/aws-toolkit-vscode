/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as localizedText from '../shared/localizedText'
import * as uuid from 'uuid' // TODO: use crypto.randomUUID when C9 is on node16
import { Credentials } from '@aws-sdk/types'
import { SsoAccessTokenProvider } from './sso/ssoAccessTokenProvider'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { errorCode, isAwsError, isNetworkError, ToolkitError, UnknownError } from '../shared/errors'
import { getCache } from './sso/cache'
import { createFactoryFunction, isNonNullable, Mutable } from '../shared/utilities/tsUtils'
import { builderIdStartUrl, SsoToken, truncateStartUrl } from './sso/model'
import { SsoClient } from './sso/clients'
import { getLogger } from '../shared/logger'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { asString, CredentialsId, CredentialsProvider, fromString } from './providers/credentials'
import { once } from '../shared/utilities/functionUtils'
import { CredentialsSettings } from './credentials/utils'
import {
    extractDataFromSection,
    getSectionOrThrow,
    loadSharedCredentialsSections,
} from './credentials/sharedCredentials'
import { getCodeCatalystDevEnvId } from '../shared/vscode/env'
import { getEnvironmentSpecificMemento } from '../shared/utilities/mementos'
import { SsoCredentialsProvider } from './providers/ssoCredentialsProvider'
import { AsyncCollection, toCollection } from '../shared/utilities/asyncCollection'
import { join, toStream } from '../shared/utilities/collectionUtils'
import { getConfigFilename } from './credentials/sharedCredentialsFile'
import { SharedCredentialsKeys, StaticProfile, StaticProfileKeyErrorMessage } from './credentials/types'
import { TempCredentialProvider } from './providers/tempCredentialsProvider'
import {
    Connection,
    ConnectionManager,
    IamConnection,
    IamProfile,
    LinkedIamProfile,
    Profile,
    ProfileMetadata,
    ProfileStore,
    SsoConnection,
    SsoProfile,
    StatefulConnection,
    StoredProfile,
    scopesCodeCatalyst,
    createBuilderIdProfile,
    createSsoProfile,
    hasScopes,
    isValidCodeCatalystConnection,
    loadIamProfilesIntoStore,
    loadLinkedProfilesIntoStore,
    scopesSsoAccountAccess,
} from './connection'
import { isSageMaker, isCloud9 } from '../shared/extensionUtilities'

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
     * Performs _server-side_ logout, and deletes the client-side connection and stateful resources.
     */
    deleteConnection(connection: Pick<Connection, 'id'>): void

    /**
     * Retrieves a connection from an id if it exists.
     *
     * A connection id can be persisted and then later used to restore a previous connection.
     * The caller is expected to handle the case where the connection no longer exists.
     */
    getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined>

    /**
     * Replaces the profile for a connection with a new one.
     *
     * This will invalidate the connection, potentially requiring a re-authentication.
     *
     * **IAM connections are not implemented**
     */
    updateConnection(connection: Pick<Connection, 'id'>, profile: Profile): Promise<Connection>
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

interface ConnectionStateChangeEvent {
    readonly id: Connection['id']
    readonly state: ProfileMetadata['connectionState']
}

export type AuthType = Auth

export class Auth implements AuthService, ConnectionManager {
    readonly #ssoCache = getCache()
    readonly #validationErrors = new Map<Connection['id'], Error>()
    readonly #invalidCredentialsTimeouts = new Map<Connection['id'], Timeout>()
    readonly #onDidChangeActiveConnection = new vscode.EventEmitter<StatefulConnection | undefined>()
    readonly #onDidChangeConnectionState = new vscode.EventEmitter<ConnectionStateChangeEvent>()
    readonly #onDidUpdateConnection = new vscode.EventEmitter<StatefulConnection>()
    readonly #onDidDeleteConnection = new vscode.EventEmitter<Connection['id']>()
    public readonly onDidChangeActiveConnection = this.#onDidChangeActiveConnection.event
    public readonly onDidChangeConnectionState = this.#onDidChangeConnectionState.event
    public readonly onDidUpdateConnection = this.#onDidUpdateConnection.event
    /** Fired when a connection and its metadata has been completely deleted */
    public readonly onDidDeleteConnection = this.#onDidDeleteConnection.event

    public constructor(
        private readonly store: ProfileStore,
        private readonly iamProfileProvider = CredentialsProviderManager.getInstance(),
        private readonly createSsoClient = SsoClient.create.bind(SsoClient),
        private readonly createTokenProvider = createFactoryFunction(SsoAccessTokenProvider)
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
            const provider = await this.getCredentialsProvider(id, profile)
            await this.authenticate(id, () => this.createCachedCredentials(provider))

            return this.getIamConnection(id, profile)
        }
    }

    public async useConnection({ id }: Pick<SsoConnection, 'id'>): Promise<SsoConnection>
    public async useConnection({ id }: Pick<IamConnection, 'id'>): Promise<IamConnection>
    public async useConnection({ id }: Pick<Connection, 'id'>): Promise<Connection> {
        const profile = this.store.getProfile(id)
        if (profile === undefined) {
            throw new Error(`Connection does not exist: ${id}`)
        }
        getLogger().info(`auth: validating connection before using it: ${id}`)
        const validated = await this.validateConnection(id, profile)
        const conn =
            validated.type === 'sso' ? this.getSsoConnection(id, validated) : this.getIamConnection(id, validated)

        this.#activeConnection = conn
        this.#onDidChangeActiveConnection.fire(conn)
        await this.store.setCurrentProfileId(id)

        return conn
    }

    public async logout(): Promise<void> {
        if (this.activeConnection === undefined) {
            return
        }
        getLogger().info(`auth: logout`)
        await this.store.setCurrentProfileId(undefined)
        await this.invalidateConnection(this.activeConnection.id)
        this.#activeConnection = undefined
        this.#onDidChangeActiveConnection.fire(undefined)
    }

    public async listConnections(): Promise<Connection[]> {
        await loadIamProfilesIntoStore(this.store, this.iamProfileProvider)

        const connections = await Promise.all(
            this.store.listProfiles().map(entry => this.getConnectionFromStoreEntry(entry))
        )

        return connections
    }

    /**
     * Gathers all local profiles plus any AWS accounts/roles associated with SSO ("IAM Identity
     * Center", "IdC") connections.
     *
     * Use {@link Auth.listConnections} to avoid API calls to the SSO service.
     */
    public listAndTraverseConnections(): AsyncCollection<Connection> {
        async function* load(this: Auth) {
            await loadIamProfilesIntoStore(this.store, this.iamProfileProvider)

            const stream = toStream(this.store.listProfiles().map(entry => this.getConnectionFromStoreEntry(entry)))

            /** Decides if SSO service should be queried for "linked" IAM roles/credentials for the given SSO connection. */
            const isLinkable = (
                entry: [string, StoredProfile<Profile>]
            ): entry is [string, StoredProfile<SsoProfile>] => {
                const r =
                    entry[1].type === 'sso' &&
                    hasScopes(entry[1], scopesSsoAccountAccess) &&
                    entry[1].metadata.connectionState === 'valid'
                return r
            }

            const linked = this.store
                .listProfiles()
                .filter(isLinkable)
                .map(([id, profile]) => {
                    return toCollection(() =>
                        loadLinkedProfilesIntoStore(
                            this.store,
                            id,
                            profile,
                            this.createSsoClient(profile.ssoRegion, this.getTokenProvider(id, profile))
                        )
                    )
                        .catch(err => {
                            getLogger().warn(`auth: failed to load linked profiles from "${id}": %s`, err)
                        })
                        .filter(isNonNullable)
                        .map(entry => this.getConnectionFromStoreEntry(entry))
                })

            yield* linked.reduce(join, stream)
        }

        return toCollection(load.bind(this))
    }

    public async createConnection(profile: SsoProfile): Promise<SsoConnection>
    public async createConnection(profile: Profile): Promise<Connection> {
        if (profile.type === 'iam') {
            throw new Error('Creating IAM connections is not supported')
        }

        const id = uuid.v4()
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
        const connId = connection.id
        const profile = this.store.getProfile(connId)

        // it is possible the connection was already deleted
        // but was still requested to be deleted. We pretend
        // we deleted it and continue as normal
        if (profile) {
            if (connId === this.#activeConnection?.id) {
                // Server-side invalidation.
                await this.logout()
            } else {
                await this.invalidateConnection(connId)
            }

            await this.store.deleteProfile(connId)

            if (profile.type === 'sso') {
                // There may have been linked IAM credentials attached to this
                // so we will want to clear them.
                await this.clearStaleLinkedIamConnections()
            }
        }

        this.#onDidDeleteConnection.fire(connId)
    }

    private async clearStaleLinkedIamConnections() {
        // Updates our store, evicting stale IAM credential profiles if the
        // SSO they are linked to was removed.
        await loadIamProfilesIntoStore(this.store, this.iamProfileProvider)

        // If we were using a IAM credential linked to the SSO it can exist as the
        // active connection but was deleted everywhere else. So we check and clear if needed.
        if (this.#activeConnection && this.store.getProfile(this.#activeConnection.id) === undefined) {
            this.#activeConnection = undefined
            this.#onDidChangeActiveConnection.fire(undefined)
        }
    }

    /**
     * @warning Only intended for Dev mode purposes
     *
     * Put the SSO connection in to an expired state
     */
    public async expireConnection(conn: Pick<SsoConnection, 'id'>): Promise<void> {
        getLogger().info(`auth: Expiring connection ${conn.id}`)
        const profile = this.store.getProfileOrThrow(conn.id)
        if (profile.type === 'iam') {
            throw new ToolkitError('Auth: Cannot force expire an IAM connection')
        }
        const provider = this.getTokenProvider(conn.id, profile)
        await provider.invalidate()
        // updates the state of the connection
        await this.validateConnection(conn.id, profile)
    }

    public async getConnection(connection: Pick<Connection, 'id'>): Promise<Connection | undefined> {
        const connections = await this.listConnections()

        return connections.find(c => c.id === connection.id)
    }

    /**
     * Sets the given connection as valid or invalid.
     * You must retrieve the updated state separately using {@link Auth.getConnectionState()}
     *
     * Alternatively you can use the `getToken()` call on an SSO connection to do the same thing,
     * but it will additionally prompt for reauthentication if the connection is invalid.
     */
    public async refreshConnectionState(connection: Pick<Connection, 'id'>): Promise<undefined> {
        const profile = this.store.getProfile(connection.id)

        if (profile === undefined) {
            return
        }

        await this.validateConnection(connection.id, profile)
    }

    public async updateConnection(connection: Pick<SsoConnection, 'id'>, profile: SsoProfile): Promise<SsoConnection>
    public async updateConnection(connection: Pick<Connection, 'id'>, profile: Profile): Promise<Connection> {
        getLogger().info(`auth: Updating connection ${connection.id}`)
        if (profile.type === 'iam') {
            throw new Error('Updating IAM connections is not supported')
        }

        await this.invalidateConnection(connection.id, { skipGlobalLogout: true })

        const newProfile = await this.store.updateProfile(connection.id, profile)
        const updatedConn = this.getSsoConnection(connection.id, newProfile as StoredProfile<SsoProfile>)
        if (this.activeConnection?.id === updatedConn.id) {
            this.#activeConnection = updatedConn
            this.#onDidChangeActiveConnection.fire(this.#activeConnection)
        }
        this.#onDidUpdateConnection.fire(updatedConn)

        return updatedConn
    }

    public getConnectionState(connection: Pick<Connection, 'id'>): StatefulConnection['state'] | undefined {
        return this.store.getProfile(connection.id)?.metadata.connectionState
    }

    public getInvalidationReason(connection: Pick<Connection, 'id'>): Error | undefined {
        return this.#validationErrors.get(connection.id)
    }

    /**
     * Authenticates the given data and returns error info if it fails.
     *
     * @returns undefined if authentication succeeds, otherwise object with error info
     */
    public async authenticateData(data: StaticProfile): Promise<StaticProfileKeyErrorMessage | undefined> {
        const tempId = await this.addTempCredential(data)
        const tempIdString = asString(tempId)
        try {
            await this.reauthenticate({ id: tempIdString })
        } catch (e) {
            if (isAwsError(e)) {
                if (e.code === 'InvalidClientTokenId') {
                    return { key: SharedCredentialsKeys.AWS_ACCESS_KEY_ID, error: 'Invalid access key' }
                } else if (e.code === 'SignatureDoesNotMatch') {
                    return { key: SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY, error: 'Invalid secret key' }
                }
            }
            throw e
        } finally {
            await this.removeTempCredential(tempId)
        }
        return undefined
    }

    private async addTempCredential(data: StaticProfile): Promise<CredentialsId> {
        const tempProvider = new TempCredentialProvider(data)
        this.iamProfileProvider.addProvider(tempProvider)
        await this.thrownOnConn(tempProvider.getCredentialsId(), 'not-exists')
        return tempProvider.getCredentialsId()
    }
    private async removeTempCredential(id: CredentialsId) {
        this.iamProfileProvider.removeProvider(id)
        await this.thrownOnConn(id, 'exists')
    }

    private async thrownOnConn(id: CredentialsId, throwOn: 'exists' | 'not-exists') {
        const idAsString = asString(id)
        const conns = await this.listConnections() // triggers loading of profile in to store
        const connExists = conns.some(conn => conn.id === idAsString)

        if (throwOn === 'exists' && connExists) {
            throw new ToolkitError(`Conn should not exist: ${idAsString}`)
        } else if (throwOn === 'not-exists' && !connExists) {
            throw new ToolkitError(`Conn should exist: ${idAsString}`)
        }
    }

    /**
     * Attempts to remove all auth state related to the connection.
     *
     * For SSO, this involves an API call to clear server-side state. The call happens
     * before the local token(s) are cleared as they are needed in the request.
     */
    private async invalidateConnection(id: Connection['id'], opt?: { skipGlobalLogout?: boolean }) {
        getLogger().info(`auth: Invalidating connection: ${id}`)
        const profile = this.store.getProfileOrThrow(id)

        if (profile.type === 'sso') {
            const provider = this.getTokenProvider(id, profile)
            const client = this.createSsoClient(profile.ssoRegion, provider)

            if (opt?.skipGlobalLogout !== true) {
                await client.logout().catch(err => {
                    const name = profile.metadata.label ?? id
                    getLogger().warn(`auth: failed to logout of connection "${name}": %s`, err)
                })
            }

            // XXX: never drop tokens in a dev environment
            if (getCodeCatalystDevEnvId() === undefined) {
                await provider.invalidate()
            }
        } else if (profile.type === 'iam') {
            globals.loginManager.store.invalidateCredentials(fromString(id))
        }

        await this.updateConnectionState(id, 'invalid')
    }

    private async updateConnectionState(id: Connection['id'], connectionState: ProfileMetadata['connectionState']) {
        getLogger().info(`auth: Updating connection state of ${id} to ${connectionState}`)
        const oldProfile = this.store.getProfileOrThrow(id)
        if (oldProfile.metadata.connectionState === connectionState) {
            return oldProfile
        }

        const profile = await this.store.updateMetadata(id, { connectionState })
        if (connectionState !== 'invalid') {
            this.#validationErrors.delete(id)
            this.#invalidCredentialsTimeouts.get(id)?.dispose()
        }

        if (this.#activeConnection?.id === id) {
            this.#activeConnection.state = connectionState
            this.#onDidChangeActiveConnection.fire(this.#activeConnection)
        }
        this.#onDidChangeConnectionState.fire({ id, state: connectionState })

        return profile
    }

    private async validateConnection<T extends Profile>(id: Connection['id'], profile: StoredProfile<T>) {
        const runCheck = async () => {
            if (profile.type === 'sso') {
                const provider = this.getTokenProvider(id, profile)
                if ((await provider.getToken()) === undefined) {
                    getLogger().info(`auth: Connection is not valid: ${id} `)
                    return this.updateConnectionState(id, 'invalid')
                } else {
                    getLogger().info(`auth: Connection is valid: ${id} `)
                    return this.updateConnectionState(id, 'valid')
                }
            } else {
                if (profile.subtype === 'linked') {
                    const sourceProfile = this.store.getProfileOrThrow(profile.ssoSession)
                    if (sourceProfile.type !== 'sso') {
                        throw new Error('Linked profiles must use an SSO connection')
                    }
                    const validatedSource = await this.validateConnection(profile.ssoSession, sourceProfile)
                    if (validatedSource?.metadata.connectionState !== 'valid') {
                        return this.updateConnectionState(id, 'invalid')
                    }
                }

                const provider = await this.getCredentialsProvider(id, profile)
                const credentials = await this.getCachedCredentials(provider)
                if (credentials !== undefined) {
                    return this.updateConnectionState(id, 'valid')
                } else if ((await provider.canAutoConnect()) === true) {
                    await this.authenticate(id, () => this.createCachedCredentials(provider))

                    return this.store.getProfileOrThrow(id)
                } else {
                    return this.updateConnectionState(id, 'invalid')
                }
            }
        }

        return runCheck().catch(err => this.handleValidationError(id, err))
    }

    private async handleValidationError(id: Connection['id'], err: unknown) {
        this.#validationErrors.set(id, UnknownError.cast(err))
        getLogger().info(`auth: Handling validation error of connection: ${id}`)
        return this.updateConnectionState(id, 'invalid')
    }

    private async getConnectionFromStoreEntry([id, profile]: readonly [Connection['id'], StoredProfile<Profile>]) {
        if (profile.type === 'sso') {
            return this.getSsoConnection(id, profile)
        } else {
            return this.getIamConnection(id, profile)
        }
    }

    private async getCredentialsProvider(id: Connection['id'], profile: StoredProfile<IamProfile>) {
        if (profile.subtype === 'unknown' || !profile.subtype) {
            const provider = await this.iamProfileProvider.getCredentialsProvider(fromString(id))
            if (provider === undefined) {
                throw new Error(`Credentials provider "${id}" not found`)
            }

            return provider
        }

        return this.getSsoLinkedCredentialsProvider(id, profile)
    }

    private getSsoLinkedCredentialsProvider(id: Connection['id'], profile: LinkedIamProfile) {
        const sourceProfile = this.store.getProfile(profile.ssoSession)
        if (sourceProfile === undefined) {
            throw new Error(`Source profile for "${id}" no longer exists`)
        }
        if (sourceProfile.type !== 'sso') {
            throw new Error(`Source profile for "${id}" is not an SSO profile`)
        }

        const tokenProvider = this.getTokenProvider(profile.ssoSession, sourceProfile)
        const credentialsProvider = new SsoCredentialsProvider(
            fromString(id),
            this.createSsoClient(sourceProfile.ssoRegion, tokenProvider),
            tokenProvider,
            profile.ssoAccountId,
            profile.ssoRoleName
        )

        this.iamProfileProvider.addProvider(credentialsProvider)

        return credentialsProvider
    }

    // XXX: always read from the same location in a dev environment
    // This detection is fuzzy if an sso-session section exists for any other reason.
    private detectSsoSessionNameForCodeCatalyst = once((): string => {
        try {
            const configFile = getConfigFilename()
            // `require('fs')` is workaround for web mode:
            const contents: string = require('fs').readFileSync(configFile, 'utf-8')
            const identifier = contents.match(/\[sso\-session (.*)\]/)?.[1]
            if (!identifier) {
                throw new ToolkitError('No sso-session name found in ~/.aws/config', { code: 'NoSsoSessionName' })
            }

            return identifier
        } catch (err) {
            const identifier = 'codecatalyst'
            getLogger().warn(`auth: unable to get an sso session name, defaulting to "${identifier}": %s`, err)
            return identifier
        }
    })

    private createCodeCatalystDevEnvProfile = async (): Promise<[id: string, profile: SsoProfile]> => {
        const identifier = this.detectSsoSessionNameForCodeCatalyst()

        const { sections } = await loadSharedCredentialsSections()
        const { sso_region: region, sso_start_url: startUrl } = extractDataFromSection(
            getSectionOrThrow(sections, identifier, 'sso-session')
        )

        if ([region, startUrl].some(prop => typeof prop !== 'string')) {
            throw new ToolkitError('sso-session data missing in ~/.aws/config', { code: 'NoSsoSession' })
        }

        return startUrl === builderIdStartUrl
            ? [identifier, createBuilderIdProfile(scopesCodeCatalyst)]
            : [identifier, createSsoProfile(region, startUrl, scopesCodeCatalyst)]
    }

    private getTokenProvider(id: Connection['id'], profile: StoredProfile<SsoProfile>) {
        // XXX: Use the token created by Dev Environments if and only if the profile is strictly
        // for CodeCatalyst, as indicated by its set of scopes. A consequence of these semantics is
        // that any profile will be coerced to use this token if that profile exclusively contains
        // CodeCatalyst scopes. Similarly, if additional scopes are added to a profile, the profile
        // no longer matches this condition.
        const shouldUseSoftwareStatement =
            getCodeCatalystDevEnvId() !== undefined &&
            profile.scopes?.every(scope => scopesCodeCatalyst.includes(scope))

        const tokenIdentifier = shouldUseSoftwareStatement ? this.detectSsoSessionNameForCodeCatalyst() : id

        return this.createTokenProvider(
            {
                identifier: tokenIdentifier,
                startUrl: profile.startUrl,
                scopes: profile.scopes,
                region: profile.ssoRegion,
            },
            this.#ssoCache
        )
    }

    private getIamConnection(
        id: Connection['id'],
        profile: StoredProfile<IamProfile>
    ): IamConnection & StatefulConnection {
        return {
            id,
            type: 'iam',
            state: profile.metadata.connectionState,
            label:
                profile.metadata.label ?? (profile.type === 'iam' && profile.subtype === 'linked' ? profile.name : id),
            getCredentials: async () => this.getCredentials(id, await this.getCredentialsProvider(id, profile)),
        }
    }

    private getSsoConnection(
        id: Connection['id'],
        profile: StoredProfile<SsoProfile>
    ): SsoConnection & StatefulConnection {
        const provider = this.getTokenProvider(id, profile)

        return {
            id,
            ...profile,
            state: profile.metadata.connectionState,
            label: profile.metadata?.label ?? this.getSsoProfileLabel(profile),
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
            await this.handleValidationError(id, err)
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
        const token = await provider.getToken().catch(err => {
            // Bubble-up networking issues so we don't treat the session as invalid
            if (isNetworkError(err)) {
                throw new ToolkitError('Failed to refresh connection due to networking issues', {
                    cause: err,
                })
            }

            this.#validationErrors.set(id, err)
        })

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
        getLogger().info(`auth: Handling invalid credentials of connection: ${id}`)
        const profile = this.store.getProfile(id)
        const previousState = profile?.metadata.connectionState
        await this.updateConnectionState(id, 'invalid')

        if (previousState === 'invalid') {
            throw new ToolkitError('Connection is invalid or expired. Try logging in again.', {
                code: errorCode.invalidConnection,
                cause: this.#validationErrors.get(id),
            })
        }
        if (previousState === 'valid') {
            // Non-token expiration errors can happen. We must log it here, otherwise they are lost.
            getLogger().warn(`auth: valid connection became invalid. Last error: %s`, this.#validationErrors.get(id))

            const timeout = new Timeout(60000)
            this.#invalidCredentialsTimeouts.set(id, timeout)

            const connLabel =
                profile?.metadata.label ?? (profile?.type === 'sso' ? this.getSsoProfileLabel(profile) : id)
            const message = localize(
                'aws.auth.invalidConnection',
                'Connection "{0}" is invalid or expired, login again?',
                connLabel
            )
            const login = localize('aws.auth.invalidConnection.loginAgain', 'Login')
            const resp = await Promise.race([
                vscode.window.showInformationMessage(message, login, localizedText.no),
                timeout.promisify(),
            ])

            if (resp !== login) {
                throw new ToolkitError('User cancelled login', {
                    cancelled: true,
                    code: errorCode.invalidConnection,
                    cause: this.#validationErrors.get(id),
                })
            }
        }

        return this.authenticate(id, refresh)
    }

    public readonly tryAutoConnect = once(async () => {
        if (this.activeConnection !== undefined) {
            return
        }

        // Clear anything stuck in an 'authenticating...' state
        // This can rarely happen when closing VS Code during authentication
        await Promise.all(
            this.store.listProfiles().map(async ([id, profile]) => {
                if (profile.metadata.connectionState === 'authenticating') {
                    await this.store.updateMetadata(id, { connectionState: 'invalid' })
                }
            })
        )

        // When opening a Dev Environment, use the environment token if no other CodeCatalyst
        // credential is in use. This token only has CC permissions currently!
        if (getCodeCatalystDevEnvId() !== undefined) {
            const connections = await this.listConnections()
            const shouldInsertDevEnvCredential = !connections.some(isValidCodeCatalystConnection)

            if (shouldInsertDevEnvCredential) {
                // Insert a profile based on the `~/.aws/config` sso-session:
                try {
                    // After creating a CodeCatalyst Dev Environment profile based on sso-session,
                    // we discard the actual key, and we insert the profile with an arbitrary key.
                    // The cache key for any strictly-CodeCatalyst profile is overriden to the
                    // sso-session identifier on read. If the coerce-on-read semantics ever become
                    // an issue, it should be possible to use the actual key here However, this
                    // would require deleting existing profiles to avoid inserting duplicates.
                    const [_dangerousDiscardActualKey, devEnvProfile] = await this.createCodeCatalystDevEnvProfile()
                    const key = uuid.v4()
                    await this.store.addProfile(key, devEnvProfile)
                    await this.store.setCurrentProfileId(key)
                } catch (err) {
                    getLogger().warn(`auth: failed to insert dev env profile: %s`, err)
                }
            }
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
                // Check for existence before using the connection to avoid noisy logs
                const conn = await this.getConnection({ id })
                if (conn === undefined) {
                    return false
                }

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
                    new CredentialsSettings().delete('profile').catch(e => {
                        getLogger().warn('CredentialsSettings.delete("profile") failed: %s', (e as Error).message)
                    })
                }
            }
        }
    })

    static #instance: Auth | undefined
    public static get instance() {
        return (this.#instance ??= new Auth(new ProfileStore(getEnvironmentSpecificMemento())))
    }

    private getSsoProfileLabel(profile: SsoProfile) {
        const truncatedUrl = truncateStartUrl(profile.startUrl)

        return profile.startUrl === builderIdStartUrl
            ? localizedText.builderId()
            : `${localizedText.iamIdentityCenter} (${truncatedUrl})`
    }
}
/**
 * Returns true if credentials are provided by the environment (ex. via ~/.aws/)
 *
 * @param isC9 boolean for if Cloud9 is host
 * @param isSM boolean for if SageMaker is host
 * @returns boolean for if C9 "OR" SM
 */
export function hasVendedIamCredentials(isC9?: boolean, isSM?: boolean) {
    isC9 ??= isCloud9()
    isSM ??= isSageMaker()
    return isSM || isC9
}
