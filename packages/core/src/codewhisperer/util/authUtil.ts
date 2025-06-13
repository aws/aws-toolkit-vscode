/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import * as nls from 'vscode-nls'
import { fs } from '../../shared/fs/fs'
import * as path from 'path'
import { ToolkitError } from '../../shared/errors'
import { AmazonQPromptSettings } from '../../shared/settings'
import {
    scopesCodeWhispererCore,
    scopesCodeWhispererChat,
    scopesFeatureDev,
    scopesGumby,
    TelemetryMetadata,
    scopesSsoAccountAccess,
    hasScopes,
    SsoProfile,
    StoredProfile,
    hasExactScopes,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger/logger'
import { Commands } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import { showAmazonQWalkthroughOnce } from '../../amazonq/onboardingPage/walkthrough'
import { setContext } from '../../shared/vscode/setContext'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { AuthStateEvent, cacheChangedEvent, LanguageClientAuth, Login, SsoLogin, IamLogin } from '../../auth/auth2'
import { builderIdStartUrl, internalStartUrl } from '../../auth/sso/constants'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { RegionProfileManager } from '../region/regionProfileManager'
import { AuthFormId } from '../../login/webview/vue/types'
import { getEnvironmentSpecificMemento } from '../../shared/utilities/mementos'
import { getCacheDir, getFlareCacheFileName, getRegistrationCacheFile, getTokenCacheFile } from '../../auth/sso/cache'
import { notifySelectDeveloperProfile } from '../region/utils'
import { once } from '../../shared/utilities/functionUtils'
import {
    CancellationTokenSource,
    GetSsoTokenResult,
    GetIamCredentialResult,
    SsoTokenSourceKind,
} from '@aws/language-server-runtimes/server-interface'

const localize = nls.loadMessageBundle()

/** Backwards compatibility for connections w pre-chat scopes */
export const codeWhispererCoreScopes = [...scopesCodeWhispererCore]
export const codeWhispererChatScopes = [...codeWhispererCoreScopes, ...scopesCodeWhispererChat]
export const amazonQScopes = [...codeWhispererChatScopes, ...scopesGumby, ...scopesFeatureDev]

/** AuthProvider interface for the auth functionality needed by RegionProfileManager  */
export interface IAuthProvider {
    isConnected(): boolean
    isBuilderIdConnection(): boolean
    isIdcConnection(): boolean
    isSsoSession(): boolean
    getToken(): Promise<string>
    readonly profileName: string
    readonly connection?: { startUrl?: string; region?: string; accessKey?: string; secretKey?: string }
}

/**
 * Handles authentication within Amazon Q.
 * Amazon Q only supports a single connection at a time.
 */
export class AuthUtil implements IAuthProvider {
    public readonly profileName = VSCODE_EXTENSION_ID.amazonq
    protected logger = getLogger('amazonqAuth')

    public readonly regionProfileManager: RegionProfileManager

    private session?: Login
    private readonly eventEmitter = new vscode.EventEmitter<AuthStateEvent>()

    static create(lspAuth: LanguageClientAuth) {
        return (this.#instance ??= new this(lspAuth))
    }

    static #instance: AuthUtil
    public static get instance() {
        if (!this.#instance) {
            throw new ToolkitError('AuthUtil not ready. Was it initialized with a running LSP?')
        }
        return this.#instance
    }

    private constructor(private readonly lspAuth: LanguageClientAuth) {
        this.onDidChangeConnectionState((e: AuthStateEvent) => this.stateChangeHandler(e))

        this.regionProfileManager = new RegionProfileManager(this)
        this.regionProfileManager.onDidChangeRegionProfile(async () => {
            await this.setVscodeContextProps()
        })
        lspAuth.registerCacheWatcher(async (event: cacheChangedEvent) => await this.cacheChangedHandler(event))
    }

    // Do NOT use this in production code, only used for testing
    static destroy(): void {
        this.#instance = undefined as any
    }

    isSsoSession(): boolean {
        return this.session instanceof SsoLogin
    }

    isIamSession(): boolean {
        return this.session instanceof IamLogin
    }

    /**
     * HACK: Ideally we'd put {@link notifySelectDeveloperProfile} in to {@link restore}.
     *       But because {@link refreshState} is only called if !isConnected, we cannot do it since
     *       {@link notifySelectDeveloperProfile} needs {@link refreshState} to run so it can set
     *       the Bearer Token in the LSP first.
     */
    didStartSignedIn = false

    async restore() {
        // If a session exists, restore it
        if (this.session) {
            await this.session.restore()
        } else {
            // Try to restore an SSO session
            this.session = new SsoLogin(this.profileName, this.lspAuth, this.eventEmitter)
            await this.session.restore()
            if (!this.isConnected()) {
                // Try to restore an IAM session
                this.session = new IamLogin(this.profileName, this.lspAuth, this.eventEmitter)
                // await this.session.restore()
                if (!this.isConnected()) {
                    // If both fail, reset the session
                    this.session = undefined
                }
            }
        }
        this.didStartSignedIn = this.isConnected()

        // HACK: We noticed that if calling `refreshState()` here when the user was already signed in, something broke.
        //       So as a solution we only call it if they were not already signed in.
        //
        //       But in the case where a user was already signed in, we allow `session.restore()` to trigger `refreshState()` through
        //       event emitters.
        //       This is unoptimal since `refreshState()` should be able to be called multiple times and still work.
        //
        //       Because of this edge case, when `restore()` is called we cannot assume all Auth is setup when this function returns,
        //       since we may still be waiting on the event emitter to trigger the expected functions.
        //
        //       TODO: Figure out why removing the if statement below causes things to break. Maybe we just need to
        //             promisify the call and any subsequent callers will not make a redundant call.
        if (!this.didStartSignedIn) {
            await this.refreshState()
        }
    }

    // Log into the desired session type using the authentication parameters
    async login(accessKey: string, secretKey: string, loginType: 'iam'): Promise<GetIamCredentialResult | undefined>
    async login(startUrl: string, region: string, loginType: 'sso'): Promise<GetSsoTokenResult | undefined>
    async login(
        first: string,
        second: string,
        loginType: 'iam' | 'sso'
    ): Promise<GetSsoTokenResult | GetIamCredentialResult | undefined> {
        let response: GetSsoTokenResult | GetIamCredentialResult | undefined

        // Start session if the current session type does not match the desired type
        if (loginType === 'sso' && !this.isSsoSession()) {
            this.session = new SsoLogin(this.profileName, this.lspAuth, this.eventEmitter)
            response = await this.session.login({ startUrl: first, region: second, scopes: amazonQScopes })
        } else if (loginType === 'iam' && !this.isIamSession()) {
            this.session = new IamLogin(this.profileName, this.lspAuth, this.eventEmitter)
            response = await this.session.login({ accessKey: first, secretKey: second })
        }

        await showAmazonQWalkthroughOnce()
        return response
    }

    reauthenticate() {
        if (!this.isSsoSession()) {
            throw new ToolkitError('Cannot reauthenticate non-SSO session.')
        }

        return this.session?.reauthenticate()
    }

    logout() {
        if (!this.isSsoSession()) {
            // Only SSO requires logout
            return
        }
        this.lspAuth.deleteBearerToken()
        const response = this.session?.logout()
        this.session = undefined
        return response
    }

    async getToken() {
        if (this.isSsoSession()) {
            return (await this.session!.getToken()).token
        } else {
            throw new ToolkitError('Cannot get token for non-SSO session.')
        }
    }

    get connection() {
        return this.session?.data
    }

    getAuthState() {
        if (this.session) {
            return this.session.getConnectionState()
        } else {
            return 'notConnected'
        }
    }

    isConnected() {
        return this.getAuthState() === 'connected'
    }

    isConnectionExpired() {
        return this.getAuthState() === 'expired'
    }

    isBuilderIdConnection() {
        return this.connection?.startUrl === builderIdStartUrl
    }

    isIdcConnection() {
        return Boolean(this.connection?.startUrl && this.connection?.startUrl !== builderIdStartUrl)
    }

    isInternalAmazonUser(): boolean {
        return this.isConnected() && this.connection?.startUrl === internalStartUrl
    }

    onDidChangeConnectionState(handler: (e: AuthStateEvent) => any) {
        return this.eventEmitter.event(handler)
    }

    public async setVscodeContextProps(state = this.getAuthState()) {
        await setContext('aws.codewhisperer.connected', state === 'connected')
        const showAmazonQLoginView =
            !this.isConnected() || this.isConnectionExpired() || this.regionProfileManager.requireProfileSelection()
        await setContext('aws.amazonq.showLoginView', showAmazonQLoginView)
        await setContext('aws.amazonq.connectedSsoIdc', this.isIdcConnection())
        await setContext('aws.codewhisperer.connectionExpired', state === 'expired')
    }

    private reauthenticatePromptShown: boolean = false
    public async showReauthenticatePrompt(isAutoTrigger?: boolean) {
        if (isAutoTrigger && this.reauthenticatePromptShown) {
            return
        }

        await showReauthenticateMessage({
            message: localizedText.connectionExpired('Amazon Q'),
            connect: localizedText.reauthenticate,
            suppressId: 'codeWhispererConnectionExpired',
            settings: AmazonQPromptSettings.instance,
            reauthFunc: async () => {
                await this.reauthenticate()
            },
        })

        if (isAutoTrigger) {
            this.reauthenticatePromptShown = true
        }
    }

    private _isCustomizationFeatureEnabled: boolean = false
    public get isCustomizationFeatureEnabled(): boolean {
        return this._isCustomizationFeatureEnabled
    }

    // This boolean controls whether the Select Customization node will be visible. A change to this value
    // means that the old UX was wrong and must refresh the devTool tree.
    public set isCustomizationFeatureEnabled(value: boolean) {
        if (this._isCustomizationFeatureEnabled === value) {
            return
        }
        this._isCustomizationFeatureEnabled = value
        void Commands.tryExecute('aws.amazonq.refreshStatusBar')
    }

    public async notifyReauthenticate(isAutoTrigger?: boolean) {
        void this.showReauthenticatePrompt(isAutoTrigger)
        await this.setVscodeContextProps()
    }

    public async notifySessionConfiguration() {
        const suppressId = 'amazonQSessionConfigurationMessage'
        const settings = AmazonQPromptSettings.instance
        const shouldShow = settings.isPromptEnabled(suppressId)
        if (!shouldShow) {
            return
        }

        const message = localize(
            'aws.amazonq.sessionConfiguration.message',
            'Your maximum session length for Amazon Q can be extended to 90 days by your administrator. For more information, refer to How to extend the session duration for Amazon Q in the IDE in the IAM Identity Center User Guide.'
        )

        const learnMoreUrl = vscode.Uri.parse(
            'https://docs.aws.amazon.com/singlesignon/latest/userguide/configure-user-session.html#90-day-extended-session-duration'
        )
        await telemetry.toolkit_showNotification.run(async () => {
            telemetry.record({ id: 'sessionExtension' })
            void vscode.window.showInformationMessage(message, localizedText.learnMore).then(async (resp) => {
                await telemetry.toolkit_invokeAction.run(async () => {
                    if (resp === localizedText.learnMore) {
                        telemetry.record({ action: 'learnMore' })
                        await openUrl(learnMoreUrl)
                    } else {
                        telemetry.record({ action: 'dismissSessionExtensionNotification' })
                    }
                    await settings.disablePrompt(suppressId)
                })
            })
        })
    }

    private async cacheChangedHandler(event: cacheChangedEvent) {
        this.logger.debug(`Cache change event received: ${event}`)
        if (event === 'delete') {
            await this.logout()
        } else if (event === 'create') {
            await this.restore()
        }
    }

    private async stateChangeHandler(e: AuthStateEvent) {
        if (e.state === 'refreshed') {
            const params = this.isSsoSession() ? (await this.session!.getToken()).updateCredentialsParams : undefined
            await this.lspAuth.updateBearerToken(params!)
            return
        } else {
            this.logger.info(`codewhisperer: connection changed to ${e.state}`)
            await this.refreshState(e.state)
        }
    }

    private async refreshState(state = this.getAuthState()) {
        if (state === 'expired' || state === 'notConnected') {
            this.lspAuth.deleteBearerToken()
            if (this.isIdcConnection()) {
                await this.regionProfileManager.invalidateProfile(this.regionProfileManager.activeRegionProfile?.arn)
                await this.regionProfileManager.clearCache()
            }
        }
        if (state === 'connected') {
            const bearerTokenParams = (await this.session!.getToken()).updateCredentialsParams
            await this.lspAuth.updateBearerToken(bearerTokenParams)

            if (this.isIdcConnection()) {
                await this.regionProfileManager.restoreProfileSelection()
            }
        }

        // regardless of state, send message at startup if user needs to select a Developer Profile
        void this.tryNotifySelectDeveloperProfile()

        vsCodeState.isFreeTierLimitReached = false
        await this.setVscodeContextProps(state)
        await Promise.all([
            Commands.tryExecute('aws.amazonq.refreshStatusBar'),
            Commands.tryExecute('aws.amazonq.updateReferenceLog'),
        ])

        if (state === 'connected' && this.isIdcConnection()) {
            void vscode.commands.executeCommand('aws.amazonq.notifyNewCustomizations')
        }
    }

    private tryNotifySelectDeveloperProfile = once(async () => {
        if (this.regionProfileManager.requireProfileSelection() && this.didStartSignedIn) {
            await notifySelectDeveloperProfile()
        }
    })

    async getTelemetryMetadata(): Promise<TelemetryMetadata> {
        if (!this.isConnected()) {
            return {
                id: 'undefined',
            }
        }

        if (this.isSsoSession()) {
            const ssoSessionDetails = (await this.session!.getProfile()).ssoSession?.settings
            return {
                authScopes: ssoSessionDetails?.sso_registration_scopes?.join(','),
                credentialSourceId: AuthUtil.instance.isBuilderIdConnection() ? 'awsId' : 'iamIdentityCenter',
                credentialStartUrl: AuthUtil.instance.connection?.startUrl,
                awsRegion: AuthUtil.instance.connection?.region,
            }
        } else if (!AuthUtil.instance.isSsoSession) {
            return {
                credentialSourceId: 'sharedCredentials',
            }
        }

        throw new Error('getTelemetryMetadataForConn() called with unknown connection type')
    }

    async getAuthFormIds(): Promise<AuthFormId[]> {
        if (!this.isConnected()) {
            return []
        }

        const authIds: AuthFormId[] = []
        let connType: 'builderId' | 'identityCenter'

        // TODO: update when there is IAM support
        if (!this.isSsoSession()) {
            return ['credentials']
        } else if (this.isBuilderIdConnection()) {
            connType = 'builderId'
        } else if (this.isIdcConnection()) {
            connType = 'identityCenter'
            const ssoSessionDetails = (await this.session!.getProfile()).ssoSession?.settings
            if (hasScopes(ssoSessionDetails?.sso_registration_scopes ?? [], scopesSsoAccountAccess)) {
                authIds.push('identityCenterExplorer')
            }
        } else {
            return ['unknown']
        }
        authIds.push(`${connType}CodeWhisperer`)

        return authIds
    }

    /**
     * Migrates existing SSO connections to the LSP identity server by updating the cache files
     *
     * @param clientName - The client name to use for the new registration cache file
     * @returns A Promise that resolves when the migration is complete
     * @throws Error if file operations fail during migration
     */
    async migrateSsoConnectionToLsp(clientName: string) {
        const memento = getEnvironmentSpecificMemento()
        const key = 'auth.profiles'
        const profiles: { readonly [id: string]: StoredProfile } | undefined = memento.get(key)

        let toImport: SsoProfile | undefined
        let profileId: string | undefined

        if (!profiles) {
            return
        }

        try {
            // Try go get token from LSP auth. If available, skip migration and delete old auth profile
            const token = await this.lspAuth.getSsoToken(
                {
                    kind: SsoTokenSourceKind.IamIdentityCenter,
                    profileName: this.profileName,
                },
                false,
                new CancellationTokenSource().token
            )
            if (token) {
                this.logger.info('existing LSP auth connection found. Skipping migration')
                await memento.update(key, undefined)
                return
            }
        } catch {
            this.logger.info('unable to get token from LSP auth, proceeding migration')
        }

        this.logger.info('checking for old SSO connections')
        for (const [id, p] of Object.entries(profiles)) {
            if (p.type === 'sso' && hasExactScopes(p.scopes ?? [], amazonQScopes)) {
                toImport = p
                profileId = id
                if (p.metadata.connectionState === 'valid') {
                    break
                }
            }
        }

        if (toImport && profileId) {
            this.logger.info('migrating SSO connection to LSP identity server...')

            const registrationKey = {
                startUrl: toImport.startUrl,
                region: toImport.ssoRegion,
                scopes: amazonQScopes,
            }

            if (this.session instanceof SsoLogin) {
                await this.session.updateProfile(registrationKey)
            }

            const cacheDir = getCacheDir()

            const fromRegistrationFile = getRegistrationCacheFile(cacheDir, registrationKey)
            const toRegistrationFile = path.join(
                cacheDir,
                getFlareCacheFileName(
                    JSON.stringify({
                        region: toImport.ssoRegion,
                        startUrl: toImport.startUrl,
                        tool: clientName,
                    })
                )
            )

            const fromTokenFile = getTokenCacheFile(cacheDir, profileId)
            const toTokenFile = path.join(cacheDir, getFlareCacheFileName(this.profileName))

            try {
                await fs.rename(fromRegistrationFile, toRegistrationFile)
                await fs.rename(fromTokenFile, toTokenFile)
                this.logger.debug('Successfully renamed registration and token files')
            } catch (err) {
                this.logger.error(`Failed to rename files during migration: ${err}`)
                throw err
            }

            this.logger.info('successfully migrated SSO connection to LSP identity server')
            await memento.update(key, undefined)
        }
    }
}
