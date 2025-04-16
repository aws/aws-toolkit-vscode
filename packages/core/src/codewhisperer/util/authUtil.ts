/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../../shared/errors'
import { AmazonQPromptSettings } from '../../shared/settings'
import { scopesCodeWhispererCore, scopesCodeWhispererChat, scopesFeatureDev, scopesGumby } from '../../auth/connection'
import { getLogger } from '../../shared/logger/logger'
import { Commands } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import { showAmazonQWalkthroughOnce } from '../../amazonq/onboardingPage/walkthrough'
import { setContext } from '../../shared/vscode/setContext'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { AuthStateEvent, LanguageClientAuth, LoginTypes, SsoLogin } from '../../auth/auth2'
import { builderIdStartUrl } from '../../auth/sso/constants'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { RegionProfileManager } from '../region/regionProfileManager'

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
    readonly connection?: { region: string; startUrl: string }
}

/**
 * Handles authentication within Amazon Q.
 * Amazon Q only supports a single connection at a time.
 */
export class AuthUtil implements IAuthProvider {
    public readonly profileName = VSCODE_EXTENSION_ID.amazonq
    public readonly regionProfileManager: RegionProfileManager

    // IAM login currently not supported
    private session: SsoLogin

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
        this.session = new SsoLogin(this.profileName, this.lspAuth)
        this.onDidChangeConnectionState((e: AuthStateEvent) => this.stateChangeHandler(e))

        this.regionProfileManager = new RegionProfileManager(this)
        this.regionProfileManager.onDidChangeRegionProfile(async () => {
            await this.setVscodeContextProps()
        })
    }

    isSsoSession() {
        return this.session.loginType === LoginTypes.SSO
    }

    async restore() {
        await this.session.restore()
    }

    async login(startUrl: string, region: string) {
        const response = await this.session.login({ startUrl, region, scopes: amazonQScopes })
        await showAmazonQWalkthroughOnce()

        return response
    }

    reauthenticate() {
        if (!this.isSsoSession()) {
            throw new ToolkitError('Cannot reauthenticate non-SSO session.')
        }

        return this.session.reauthenticate()
    }

    logout() {
        if (!this.isSsoSession()) {
            // Only SSO requires logout
            return
        }
        this.lspAuth.deleteBearerToken()
        return this.session.logout()
    }

    async getToken() {
        if (this.isSsoSession()) {
            return (await this.session.getToken()).token
        } else {
            throw new ToolkitError('Cannot get token for non-SSO session.')
        }
    }

    get connection() {
        return this.session.data
    }

    getAuthState() {
        return this.session.getConnectionState()
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

    onDidChangeConnectionState(handler: (e: AuthStateEvent) => any) {
        return this.session.onDidChangeConnectionState(handler)
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

    private async stateChangeHandler(e: AuthStateEvent) {
        if (e.state === 'refreshed') {
            const params = this.isSsoSession() ? (await this.session.getToken()).updateCredentialsParams : undefined
            await this.lspAuth.updateBearerToken(params!)
            return
        } else {
            getLogger().info(`codewhisperer: connection changed to ${e.state}`)
            await this.refreshState(e.state)
        }
    }

    private async refreshState(state = this.getAuthState()) {
        if (state === 'expired' || state === 'notConnected') {
            if (this.isIdcConnection()) {
                await this.regionProfileManager.invalidateProfile(this.regionProfileManager.activeRegionProfile?.arn)
            }
            this.lspAuth.deleteBearerToken()
        }
        if (state === 'connected') {
            if (this.isIdcConnection()) {
                await this.regionProfileManager.restoreProfileSelection()
            }
            const bearerTokenParams = (await this.session.getToken()).updateCredentialsParams
            await this.lspAuth.updateBearerToken(bearerTokenParams)
        }

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
}
