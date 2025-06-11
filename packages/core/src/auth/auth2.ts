/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as jose from 'jose'
import {
    GetSsoTokenParams,
    getSsoTokenRequestType,
    GetSsoTokenResult,
    GetStsCredentialParams,
    getStsCredentialRequestType,
    GetStsCredentialResult,
    IamIdentityCenterSsoTokenSource,
    InvalidateSsoTokenParams,
    invalidateSsoTokenRequestType,
    ProfileKind,
    UpdateProfileParams,
    updateProfileRequestType,
    SsoTokenChangedParams,
    StsCredentialChangedParams,
    ssoTokenChangedRequestType,
    stsCredentialChangedRequestType,
    AwsBuilderIdSsoTokenSource,
    UpdateCredentialsParams,
    AwsErrorCodes,
    SsoTokenSourceKind,
    listProfilesRequestType,
    ListProfilesResult,
    UpdateProfileResult,
    InvalidateSsoTokenResult,
    AuthorizationFlowKind,
    CancellationToken,
    CancellationTokenSource,
    iamCredentialsDeleteNotificationType,
    bearerCredentialsDeleteNotificationType,
    bearerCredentialsUpdateRequestType,
    CredentialChangedKind,
    RequestType,
    ResponseMessage,
    NotificationType,
    ConnectionMetadata,
    getConnectionMetadataRequestType,
    iamCredentialsUpdateRequestType,
    Profile,
    SsoSession,
    IamSession,
    invalidateStsCredentialRequestType,
    InvalidateStsCredentialParams,
    InvalidateStsCredentialResult,
} from '@aws/language-server-runtimes/protocol'
import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from '../shared/logger/logger'
import { ToolkitError } from '../shared/errors'
import { useDeviceFlow } from './sso/ssoAccessTokenProvider'
import { getCacheDir, getCacheFileWatcher, getFlareCacheFileName } from './sso/cache'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'

export const notificationTypes = {
    updateIamCredential: new RequestType<UpdateCredentialsParams, ResponseMessage, Error>(
        iamCredentialsUpdateRequestType.method
    ),
    deleteIamCredential: new NotificationType(iamCredentialsDeleteNotificationType.method),
    updateBearerToken: new RequestType<UpdateCredentialsParams, ResponseMessage, Error>(
        bearerCredentialsUpdateRequestType.method
    ),
    deleteBearerToken: new NotificationType(bearerCredentialsDeleteNotificationType.method),
    getConnectionMetadata: new RequestType<undefined, ConnectionMetadata, Error>(
        getConnectionMetadataRequestType.method
    ),
}

export type AuthState = 'notConnected' | 'connected' | 'expired'

export type AuthStateEvent = { id: string; state: AuthState | 'refreshed' }

export const LoginTypes = {
    SSO: 'sso',
    IAM: 'iam',
} as const
export type LoginType = (typeof LoginTypes)[keyof typeof LoginTypes]

export type cacheChangedEvent = 'delete' | 'create'

export type Login = SsoLogin | IamLogin

export type TokenSource = IamIdentityCenterSsoTokenSource | AwsBuilderIdSsoTokenSource

/**
 * Handles auth requests to the Identity Server in the Amazon Q LSP.
 */
export class LanguageClientAuth {
    readonly #ssoCacheWatcher = getCacheFileWatcher(getCacheDir(), getFlareCacheFileName(VSCODE_EXTENSION_ID.amazonq))

    constructor(
        private readonly client: LanguageClient,
        private readonly clientName: string,
        public readonly encryptionKey: Buffer
    ) {}

    public get cacheWatcher() {
        return this.#ssoCacheWatcher
    }

    getSsoToken(
        tokenSource: TokenSource,
        login: boolean = false,
        cancellationToken?: CancellationToken
    ): Promise<GetSsoTokenResult> {
        return this.client.sendRequest(
            getSsoTokenRequestType.method,
            {
                clientName: this.clientName,
                source: tokenSource,
                options: {
                    loginOnInvalidToken: login,
                    authorizationFlow: useDeviceFlow() ? AuthorizationFlowKind.DeviceCode : AuthorizationFlowKind.Pkce,
                },
            } satisfies GetSsoTokenParams,
            cancellationToken
        )
    }

    getStsCredential(login: boolean = false, cancellationToken?: CancellationToken): Promise<GetStsCredentialResult> {
        return this.client.sendRequest(
            getStsCredentialRequestType.method,
            {
                clientName: this.clientName,
                options: {
                    loginOnInvalidToken: login,
                },
            } satisfies GetStsCredentialParams,
            cancellationToken
        )
    }

    updateSsoProfile(
        profileName: string,
        startUrl: string,
        region: string,
        scopes: string[]
    ): Promise<UpdateProfileResult> {
        return this.client.sendRequest(updateProfileRequestType.method, {
            profile: {
                kinds: [ProfileKind.SsoTokenProfile],
                name: profileName,
                settings: {
                    region,
                    sso_session: profileName,
                },
            },
            ssoSession: {
                name: profileName,
                settings: {
                    sso_region: region,
                    sso_start_url: startUrl,
                    sso_registration_scopes: scopes,
                },
            },
        } satisfies UpdateProfileParams)
    }

    updateIamProfile(profileName: string, accessKey: string, secretKey: string): Promise<UpdateProfileResult> {
        return this.client.sendRequest(updateProfileRequestType.method, {
            profile: {
                kinds: [ProfileKind.SsoTokenProfile],
                name: profileName,
            },
            iamSession: {
                name: profileName,
                credentials: {
                    accessKeyId: accessKey,
                    secretAccessKey: secretKey,
                },
            },
        } satisfies UpdateProfileParams)
    }

    listProfiles() {
        return this.client.sendRequest(listProfilesRequestType.method, {}) as Promise<ListProfilesResult>
    }

    /**
     * Returns a profile by name along with its linked session.
     * Does not currently exist as an API in the Identity Service.
     */
    async getProfile(profileName: string) {
        const response = await this.listProfiles()
        const profile = response.profiles.find((profile) => profile.name === profileName)
        const ssoSession = profile?.settings?.sso_session
            ? response.ssoSessions.find((session) => session.name === profile!.settings!.sso_session)
            : undefined
        const iamSession = undefined
        // const iamSession = profile?.settings?.sso_session
        //     ? response.iamSessions?.find((session) => session.name === profile!.settings!.sso_session)
        //     : undefined

        return { profile, ssoSession, iamSession }
    }

    updateBearerToken(request: UpdateCredentialsParams) {
        return this.client.sendRequest(bearerCredentialsUpdateRequestType.method, request)
    }

    deleteBearerToken() {
        return this.client.sendNotification(bearerCredentialsDeleteNotificationType.method)
    }

    updateStsCredential(request: UpdateCredentialsParams) {
        return this.client.sendRequest(iamCredentialsUpdateRequestType.method, request)
    }

    deleteStsCredential() {
        return this.client.sendNotification(iamCredentialsDeleteNotificationType.method)
    }

    invalidateSsoToken(tokenId: string) {
        return this.client.sendRequest(invalidateSsoTokenRequestType.method, {
            ssoTokenId: tokenId,
        } satisfies InvalidateSsoTokenParams) as Promise<InvalidateSsoTokenResult>
    }

    invalidateStsCredential(tokenId: string) {
        return this.client.sendRequest(invalidateStsCredentialRequestType.method, {
            stsCredentialId: tokenId,
        } satisfies InvalidateStsCredentialParams) as Promise<InvalidateStsCredentialResult>
    }

    registerSsoTokenChangedHandler(ssoTokenChangedHandler: (params: SsoTokenChangedParams) => any) {
        this.client.onNotification(ssoTokenChangedRequestType.method, ssoTokenChangedHandler)
    }

    registerStsCredentialChangedHandler(stsCredentialChangedHandler: (params: StsCredentialChangedParams) => any) {
        this.client.onNotification(stsCredentialChangedRequestType.method, stsCredentialChangedHandler)
    }

    registerCacheWatcher(cacheChangedHandler: (event: cacheChangedEvent) => any) {
        this.cacheWatcher.onDidCreate(() => cacheChangedHandler('create'))
        this.cacheWatcher.onDidDelete(() => cacheChangedHandler('delete'))
    }
}

/**
 * Abstract class for connection management
 */
export abstract class BaseLogin {
    protected connectionState: AuthState = 'notConnected'
    protected cancellationToken: CancellationTokenSource | undefined
    protected _data: { startUrl?: string; region?: string; accessKey?: string; secretKey?: string } | undefined

    constructor(
        public readonly profileName: string,
        protected readonly lspAuth: LanguageClientAuth,
        protected readonly eventEmitter: vscode.EventEmitter<AuthStateEvent>
    ) {}

    abstract login(opts: any): Promise<GetSsoTokenResult | GetStsCredentialResult | undefined>
    abstract reauthenticate(): Promise<GetSsoTokenResult | GetStsCredentialResult | undefined>
    abstract logout(): void
    abstract restore(): void
    abstract getToken(): Promise<{ token: string; updateCredentialsParams: UpdateCredentialsParams }>

    get data() {
        return this._data
    }

    /**
     * Cancels running active login flows.
     */
    cancelLogin() {
        this.cancellationToken?.cancel()
        this.cancellationToken?.dispose()
        this.cancellationToken = undefined
    }

    /**
     * Gets the profile and session associated with a profile name
     */
    async getProfile(): Promise<{
        profile: Profile | undefined
        ssoSession: SsoSession | undefined
        iamSession: IamSession | undefined
    }> {
        return await this.lspAuth.getProfile(this.profileName)
    }

    /**
     * Gets the current connection state
     */
    getConnectionState(): AuthState {
        return this.connectionState
    }

    /**
     * Sets the connection state and fires an event if the state changed
     */
    protected updateConnectionState(state: AuthState) {
        const oldState = this.connectionState
        const newState = state

        this.connectionState = newState

        if (oldState !== newState) {
            this.eventEmitter.fire({ id: this.profileName, state: this.connectionState })
        }
    }
}

/**
 * Manages an SSO connection.
 */
export class SsoLogin extends BaseLogin {
    // Cached information from the identity server for easy reference
    private ssoTokenId: string | undefined

    constructor(profileName: string, lspAuth: LanguageClientAuth, eventEmitter: vscode.EventEmitter<AuthStateEvent>) {
        super(profileName, lspAuth, eventEmitter)
        lspAuth.registerSsoTokenChangedHandler((params: SsoTokenChangedParams) => this.ssoTokenChangedHandler(params))
    }

    async login(opts: { startUrl: string; region: string; scopes: string[] }) {
        await this.updateProfile(opts)
        return this._getSsoToken(true)
    }

    async reauthenticate() {
        if (this.connectionState === 'notConnected') {
            throw new ToolkitError('Cannot reauthenticate when not connected.')
        }
        return this._getSsoToken(true)
    }

    async logout() {
        if (this.ssoTokenId) {
            await this.lspAuth.invalidateSsoToken(this.ssoTokenId)
        }
        this.updateConnectionState('notConnected')
        this._data = undefined
        // TODO: DeleteProfile api in Identity Service (this doesn't exist yet)
    }

    async updateProfile(opts: { startUrl: string; region: string; scopes: string[] }) {
        await this.lspAuth.updateSsoProfile(this.profileName, opts.startUrl, opts.region, opts.scopes)
        this._data = {
            startUrl: opts.startUrl,
            region: opts.region,
        }
    }

    /**
     * Restore the connection state and connection details to memory, if they exist.
     */
    async restore() {
        const sessionData = await this.getProfile()
        const ssoSession = sessionData?.ssoSession?.settings
        if (ssoSession?.sso_region && ssoSession?.sso_start_url) {
            this._data = {
                startUrl: ssoSession.sso_start_url,
                region: ssoSession.sso_region,
            }
        }

        try {
            await this._getSsoToken(false)
        } catch (err) {
            getLogger().error('Restoring connection failed: %s', err)
        }
    }

    /**
     * Returns both the decrypted access token and the payload to send to the `updateCredentials` LSP API
     * with encrypted token
     */
    async getToken() {
        const response = await this._getSsoToken(false)
        const decryptedKey = await jose.compactDecrypt(response.ssoToken.accessToken, this.lspAuth.encryptionKey)
        return {
            token: decryptedKey.plaintext.toString().replaceAll('"', ''),
            updateCredentialsParams: response.updateCredentialsParams,
        }
    }

    /**
     * Returns the response from `getSsoToken` LSP API and sets the connection state based on the errors/result
     * of the call.
     */
    private async _getSsoToken(login: boolean) {
        let response: GetSsoTokenResult
        this.cancellationToken = new CancellationTokenSource()

        try {
            response = await this.lspAuth.getSsoToken(
                {
                    /**
                     * Note that we do not use SsoTokenSourceKind.AwsBuilderId here.
                     * This is because it does not leave any state behind on disk, so
                     * we cannot infer that a builder ID connection exists via the
                     * Identity Server alone.
                     */
                    kind: SsoTokenSourceKind.IamIdentityCenter,
                    profileName: this.profileName,
                } satisfies IamIdentityCenterSsoTokenSource,
                login,
                this.cancellationToken.token
            )
        } catch (err: any) {
            switch (err.data?.awsErrorCode) {
                case AwsErrorCodes.E_CANCELLED:
                case AwsErrorCodes.E_SSO_SESSION_NOT_FOUND:
                case AwsErrorCodes.E_PROFILE_NOT_FOUND:
                case AwsErrorCodes.E_INVALID_SSO_TOKEN:
                    this.updateConnectionState('notConnected')
                    break
                case AwsErrorCodes.E_CANNOT_REFRESH_SSO_TOKEN:
                    this.updateConnectionState('expired')
                    break
                // TODO: implement when identity server emits E_NETWORK_ERROR, E_FILESYSTEM_ERROR
                // case AwsErrorCodes.E_NETWORK_ERROR:
                // case AwsErrorCodes.E_FILESYSTEM_ERROR:
                //     // do stuff, probably nothing at all
                //     break
                default:
                    getLogger().error('SsoLogin: unknown error when requesting token: %s', err)
                    break
            }
            throw err
        } finally {
            this.cancellationToken?.dispose()
            this.cancellationToken = undefined
        }

        this.ssoTokenId = response.ssoToken.id
        this.updateConnectionState('connected')
        return response
    }

    private ssoTokenChangedHandler(params: SsoTokenChangedParams) {
        if (params.ssoTokenId === this.ssoTokenId) {
            if (params.kind === CredentialChangedKind.Expired) {
                this.updateConnectionState('expired')
                return
            } else if (params.kind === CredentialChangedKind.Refreshed) {
                this.eventEmitter.fire({ id: this.profileName, state: 'refreshed' })
            }
        }
    }
}

/**
 * Manages an IAM credentials connection.
 */
export class IamLogin extends BaseLogin {
    // Cached information from the identity server for easy reference
    private stsCredentialId: string | undefined

    constructor(profileName: string, lspAuth: LanguageClientAuth, eventEmitter: vscode.EventEmitter<AuthStateEvent>) {
        super(profileName, lspAuth, eventEmitter)
        lspAuth.registerStsCredentialChangedHandler((params: StsCredentialChangedParams) =>
            this.stsCredentialChangedHandler(params)
        )
    }

    async login(opts: { accessKey: string; secretKey: string }) {
        await this.updateProfile(opts)
        return this._getStsCredential(true)
    }

    async reauthenticate() {
        if (this.connectionState === 'notConnected') {
            throw new ToolkitError('Cannot reauthenticate when not connected.')
        }
        return this._getStsCredential(true)
    }

    async logout() {
        if (this.stsCredentialId) {
            await this.lspAuth.invalidateStsCredential(this.stsCredentialId)
        }
        this.updateConnectionState('notConnected')
        this._data = undefined
        // TODO: DeleteProfile api in Identity Service (this doesn't exist yet)
    }

    async updateProfile(opts: { accessKey: string; secretKey: string }) {
        await this.lspAuth.updateIamProfile(this.profileName, opts.accessKey, opts.secretKey)
        this._data = {
            accessKey: opts.accessKey,
            secretKey: opts.secretKey,
        }
    }

    /**
     * Restore the connection state and connection details to memory, if they exist.
     */
    async restore() {
        const sessionData = await this.getProfile()
        const credentials = sessionData?.iamSession?.credentials
        if (credentials?.accessKeyId && credentials?.secretAccessKey) {
            this._data = {
                accessKey: credentials.accessKeyId,
                secretKey: credentials.secretAccessKey,
            }
        }
        try {
            await this._getStsCredential(false)
        } catch (err) {
            getLogger().error('Restoring connection failed: %s', err)
        }
    }

    /**
     * Returns both the decrypted access token and the payload to send to the `updateCredentials` LSP API
     * with encrypted token
     */
    async getToken() {
        // TODO: fix STS credential decryption
        const response = await this._getStsCredential(false)
        const decryptedKey = await jose.compactDecrypt(response.stsCredential.id, this.lspAuth.encryptionKey)
        return {
            token: decryptedKey.plaintext.toString().replaceAll('"', ''),
            updateCredentialsParams: response.updateCredentialsParams,
        }
    }

    /**
     * Returns the response from `getSsoToken` LSP API and sets the connection state based on the errors/result
     * of the call.
     */
    private async _getStsCredential(login: boolean) {
        let response: GetStsCredentialResult
        this.cancellationToken = new CancellationTokenSource()

        try {
            response = await this.lspAuth.getStsCredential(login, this.cancellationToken.token)
        } catch (err: any) {
            switch (err.data?.awsErrorCode) {
                case AwsErrorCodes.E_CANCELLED:
                case AwsErrorCodes.E_SSO_SESSION_NOT_FOUND:
                case AwsErrorCodes.E_PROFILE_NOT_FOUND:
                case AwsErrorCodes.E_INVALID_SSO_TOKEN:
                    this.updateConnectionState('notConnected')
                    break
                case AwsErrorCodes.E_CANNOT_REFRESH_SSO_TOKEN:
                    this.updateConnectionState('expired')
                    break
                // TODO: implement when identity server emits E_NETWORK_ERROR, E_FILESYSTEM_ERROR
                // case AwsErrorCodes.E_NETWORK_ERROR:
                // case AwsErrorCodes.E_FILESYSTEM_ERROR:
                //     // do stuff, probably nothing at all
                //     break
                default:
                    getLogger().error('SsoLogin: unknown error when requesting token: %s', err)
                    break
            }
            throw err
        } finally {
            this.cancellationToken?.dispose()
            this.cancellationToken = undefined
        }

        this.stsCredentialId = response.stsCredential.id
        this.updateConnectionState('connected')
        return response
    }

    private stsCredentialChangedHandler(params: StsCredentialChangedParams) {
        if (params.stsCredentialId === this.stsCredentialId) {
            if (params.kind === CredentialChangedKind.Expired) {
                this.updateConnectionState('expired')
                return
            } else if (params.kind === CredentialChangedKind.Refreshed) {
                this.eventEmitter.fire({ id: this.profileName, state: 'refreshed' })
            }
        }
    }
}
