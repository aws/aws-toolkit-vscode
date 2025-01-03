/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { Auth } from '../../auth/auth'
import { ToolkitError, isNetworkError, tryRun } from '../../shared/errors'
import { getSecondaryAuth, setScopes } from '../../auth/secondaryAuth'
import { isCloud9, isSageMaker } from '../../shared/extensionUtilities'
import { AmazonQPromptSettings } from '../../shared/settings'
import {
    scopesCodeWhispererCore,
    createBuilderIdProfile,
    hasScopes,
    SsoConnection,
    createSsoProfile,
    Connection,
    isIamConnection,
    isSsoConnection,
    isBuilderIdConnection,
    scopesCodeWhispererChat,
    scopesFeatureDev,
    scopesGumby,
    isIdcSsoConnection,
    hasExactScopes,
    getTelemetryMetadataForConn,
    ProfileNotFoundError,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger'
import { Commands, placeholder } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'
import { onceChanged, once } from '../../shared/utilities/functionUtils'
import { indent } from '../../shared/utilities/textUtilities'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import { showAmazonQWalkthroughOnce } from '../../amazonq/onboardingPage/walkthrough'
import { setContext } from '../../shared/vscode/setContext'
import { isInDevEnv } from '../../shared/vscode/env'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { telemetry } from '../../shared/telemetry/telemetry'
import { asStringifiedStack } from '../../shared/telemetry/spans'
import { withTelemetryContext } from '../../shared/telemetry/util'
import { focusAmazonQPanel } from '../../codewhispererChat/commands/registerCommands'

/** Backwards compatibility for connections w pre-chat scopes */
export const codeWhispererCoreScopes = [...scopesCodeWhispererCore]
export const codeWhispererChatScopes = [...codeWhispererCoreScopes, ...scopesCodeWhispererChat]
export const amazonQScopes = [...codeWhispererChatScopes, ...scopesGumby, ...scopesFeatureDev]

/**
 * "Core" are the CW scopes that existed before the addition of new scopes
 * for Amazon Q.
 */
export const isValidCodeWhispererCoreConnection = (conn?: Connection): conn is Connection => {
    if (isCloud9('classic')) {
        return isIamConnection(conn)
    }

    return (
        (isSageMaker() && isIamConnection(conn)) ||
        (isCloud9('codecatalyst') && isIamConnection(conn)) ||
        (isSsoConnection(conn) && hasScopes(conn, codeWhispererCoreScopes))
    )
}
/** Superset that includes all of CodeWhisperer + Amazon Q */
export const isValidAmazonQConnection = (conn?: Connection): conn is Connection => {
    return (
        (isSageMaker() && isIamConnection(conn)) ||
        ((isSsoConnection(conn) || isBuilderIdConnection(conn)) &&
            isValidCodeWhispererCoreConnection(conn) &&
            hasScopes(conn, amazonQScopes))
    )
}

const authClassName = 'AuthQ'

export class AuthUtil {
    static #instance: AuthUtil
    protected static readonly logIfChanged = onceChanged((s: string) => getLogger().info(s))

    private reauthenticatePromptShown: boolean = false
    private _isCustomizationFeatureEnabled: boolean = false

    // user should only see that screen once.
    // TODO: move to memento
    public hasAlreadySeenMigrationAuthScreen: boolean = false

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

    public readonly secondaryAuth = getSecondaryAuth(
        this.auth,
        'codewhisperer',
        'Amazon Q',
        isValidCodeWhispererCoreConnection
    )
    public readonly restore = () => this.secondaryAuth.restoreConnection()

    public constructor(public readonly auth = Auth.instance) {}

    public initCodeWhispererHooks = once(() => {
        this.auth.onDidChangeConnectionState(async (e) => {
            getLogger().info(`codewhisperer: connection changed to ${e.state}: ${e.id}`)
            if (e.state !== 'authenticating') {
                await this.refreshCodeWhisperer()
            }

            await this.setVscodeContextProps()
        })

        this.secondaryAuth.onDidChangeActiveConnection(async () => {
            getLogger().info(`codewhisperer: active connection changed`)
            if (this.isValidEnterpriseSsoInUse()) {
                void vscode.commands.executeCommand('aws.amazonq.notifyNewCustomizations')
            }
            vsCodeState.isFreeTierLimitReached = false
            await Promise.all([
                // onDidChangeActiveConnection may trigger before these modules are activated.
                Commands.tryExecute('aws.amazonq.refreshStatusBar'),
                Commands.tryExecute('aws.amazonq.updateReferenceLog'),
            ])

            await this.setVscodeContextProps()

            // To check valid connection
            if (this.isValidEnterpriseSsoInUse() || (this.isBuilderIdInUse() && !this.isConnectionExpired())) {
                await showAmazonQWalkthroughOnce()
            }
        })
    })

    public async setVscodeContextProps() {
        if (isCloud9()) {
            return
        }

        await setContext('aws.codewhisperer.connected', this.isConnected())
        const doShowAmazonQLoginView = !this.isConnected() || this.isConnectionExpired()
        await setContext('aws.amazonq.showLoginView', doShowAmazonQLoginView)
        await setContext('aws.codewhisperer.connectionExpired', this.isConnectionExpired())
    }

    public reformatStartUrl(startUrl: string | undefined) {
        return !startUrl ? undefined : startUrl.replace(/[\/#]+$/g, '')
    }

    // current active cwspr connection
    public get conn() {
        return this.secondaryAuth.activeConnection
    }

    // TODO: move this to the shared auth.ts
    public get startUrl(): string | undefined {
        // Reformat the url to remove any trailing '/' and `#`
        // e.g. https://view.awsapps.com/start/# will become https://view.awsapps.com/start
        return isSsoConnection(this.conn) ? this.reformatStartUrl(this.conn?.startUrl) : undefined
    }

    public get isUsingSavedConnection() {
        return this.conn !== undefined && this.secondaryAuth.hasSavedConnection
    }

    public isConnected(): boolean {
        return this.conn !== undefined
    }

    public isEnterpriseSsoInUse(): boolean {
        const conn = this.conn
        // we have an sso that isn't builder id, must be IdC by process of elimination
        const isUsingEnterpriseSso = conn?.type === 'sso' && !isBuilderIdConnection(conn)
        return conn !== undefined && isUsingEnterpriseSso
    }

    // If there is an active SSO connection
    public isValidEnterpriseSsoInUse(): boolean {
        return this.isEnterpriseSsoInUse() && !this.isConnectionExpired()
    }

    public isBuilderIdInUse(): boolean {
        return this.conn !== undefined && isBuilderIdConnection(this.conn)
    }

    @withTelemetryContext({ name: 'connectToAwsBuilderId', class: authClassName })
    public async connectToAwsBuilderId(): Promise<SsoConnection> {
        let conn = (await this.auth.listConnections()).find(isBuilderIdConnection)

        if (!conn) {
            conn = await this.auth.createConnection(createBuilderIdProfile(amazonQScopes))
        } else if (!isValidAmazonQConnection(conn)) {
            conn = await this.secondaryAuth.addScopes(conn, amazonQScopes)
        }

        if (this.auth.getConnectionState(conn) === 'invalid') {
            conn = await this.auth.reauthenticate(conn)
        }

        return (await this.secondaryAuth.useNewConnection(conn)) as SsoConnection
    }

    @withTelemetryContext({ name: 'connectToEnterpriseSso', class: authClassName })
    public async connectToEnterpriseSso(startUrl: string, region: string): Promise<SsoConnection> {
        let conn = (await this.auth.listConnections()).find(
            (conn): conn is SsoConnection =>
                isSsoConnection(conn) && conn.startUrl.toLowerCase() === startUrl.toLowerCase()
        )

        if (!conn) {
            conn = await this.auth.createConnection(createSsoProfile(startUrl, region, amazonQScopes))
        } else if (!isValidAmazonQConnection(conn)) {
            conn = await this.secondaryAuth.addScopes(conn, amazonQScopes)
        }

        if (this.auth.getConnectionState(conn) === 'invalid') {
            conn = await this.auth.reauthenticate(conn)
        }

        return (await this.secondaryAuth.useNewConnection(conn)) as SsoConnection
    }

    public static get instance() {
        if (this.#instance !== undefined) {
            return this.#instance
        }

        const self = (this.#instance = new this())
        return self
    }

    @withTelemetryContext({ name: 'getBearerToken', class: authClassName })
    public async getBearerToken(): Promise<string> {
        await this.restore()

        if (this.conn === undefined) {
            throw new ToolkitError('No connection found', { code: 'NoConnection' })
        }

        if (!isSsoConnection(this.conn)) {
            throw new ToolkitError('Connection is not an SSO connection', { code: 'BadConnectionType' })
        }

        try {
            const bearerToken = await this.conn.getToken()
            return bearerToken.accessToken
        } catch (err) {
            if (err instanceof ProfileNotFoundError) {
                // Expected that connection would be deleted by conn.getToken()
                void focusAmazonQPanel.execute(placeholder, 'profileNotFoundSignout')
            }
            throw err
        }
    }

    @withTelemetryContext({ name: 'getCredentials', class: authClassName })
    public async getCredentials() {
        await this.restore()

        if (this.conn === undefined) {
            throw new ToolkitError('No connection found', { code: 'NoConnection' })
        }

        if (!isIamConnection(this.conn)) {
            throw new ToolkitError('Connection is not an IAM connection', { code: 'BadConnectionType' })
        }

        return this.conn.getCredentials()
    }

    public isConnectionValid(log: boolean = true): boolean {
        const connectionValid = this.conn !== undefined && !this.secondaryAuth.isConnectionExpired

        if (log) {
            this.logConnection()
        }

        return connectionValid
    }

    public isConnectionExpired(log: boolean = true): boolean {
        const connectionExpired =
            this.secondaryAuth.isConnectionExpired &&
            this.conn !== undefined &&
            isValidCodeWhispererCoreConnection(this.conn)

        if (log) {
            this.logConnection()
        }

        return connectionExpired
    }

    private logConnection() {
        const logStr = indent(
            `codewhisperer: connection states
            connection isValid=${this.isConnectionValid(false)},
            connection isValidCodewhispererCoreConnection=${isValidCodeWhispererCoreConnection(this.conn)},
            connection isExpired=${this.isConnectionExpired(false)},
            secondaryAuth isExpired=${this.secondaryAuth.isConnectionExpired},
            connection isUndefined=${this.conn === undefined}`,
            4,
            true
        )

        AuthUtil.logIfChanged(logStr)
    }

    @withTelemetryContext({ name: 'reauthenticate', class: authClassName })
    public async reauthenticate() {
        try {
            if (this.conn?.type !== 'sso') {
                return
            }

            if (!hasExactScopes(this.conn, amazonQScopes)) {
                const conn = await setScopes(this.conn, amazonQScopes, this.auth)
                await this.secondaryAuth.useNewConnection(conn)
            }

            await this.auth.reauthenticate(this.conn)
        } catch (err) {
            throw ToolkitError.chain(err, 'Unable to authenticate connection')
        } finally {
            await this.setVscodeContextProps()
        }
    }

    public async refreshCodeWhisperer() {
        vsCodeState.isFreeTierLimitReached = false
        await Commands.tryExecute('aws.amazonq.refreshStatusBar')
    }

    @withTelemetryContext({ name: 'showReauthenticatePrompt', class: authClassName })
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

    @withTelemetryContext({ name: 'notifyReauthenticate', class: authClassName })
    public async notifyReauthenticate(isAutoTrigger?: boolean) {
        void this.showReauthenticatePrompt(isAutoTrigger)
        await this.setVscodeContextProps()
    }

    public isValidCodeTransformationAuthUser(): boolean {
        return (this.isEnterpriseSsoInUse() || this.isBuilderIdInUse()) && this.isConnectionValid()
    }

    /**
     * Asynchronously returns a snapshot of the overall auth state of CodeWhisperer + Chat features.
     * It guarantees the latest state is correct at the risk of modifying connection state.
     * If this guarantee is not required, use sync method getChatAuthStateSync()
     *
     * By default, network errors are ignored when determining auth state since they may be silently
     * recoverable later.
     */
    @withTelemetryContext({ name: 'getChatAuthState', class: authClassName })
    public async getChatAuthState(ignoreNetErr: boolean = true): Promise<FeatureAuthState> {
        // The state of the connection may not have been properly validated
        // and the current state we see may be stale, so refresh for latest state.
        if (ignoreNetErr) {
            await tryRun(
                () => this.auth.refreshConnectionState(this.conn),
                (err) => !isNetworkError(err),
                'getChatAuthState: Cannot refresh connection state due to network error: %s'
            )
        } else {
            await this.auth.refreshConnectionState(this.conn)
        }

        return this.getChatAuthStateSync(this.conn)
    }

    /**
     * Synchronously returns a snapshot of the overall auth state of CodeWhisperer + Chat features without
     * validating or modifying the connection state. It is possible that the connection
     * is invalid/valid, but the current state displays something else. To guarantee the true state,
     * use async method getChatAuthState()
     */
    public getChatAuthStateSync(conn = this.conn): FeatureAuthState {
        if (conn === undefined) {
            return buildFeatureAuthState(AuthStates.disconnected)
        }

        if (!isSsoConnection(conn) && !isSageMaker()) {
            throw new ToolkitError(`Connection "${conn.id}" is not a valid type: ${conn.type}`)
        }

        // default to expired to indicate reauth is needed if unmodified
        const state: FeatureAuthState = buildFeatureAuthState(AuthStates.expired)

        if (this.isConnectionExpired()) {
            return state
        }

        if (isBuilderIdConnection(conn) || isIdcSsoConnection(conn) || isSageMaker()) {
            if (isValidCodeWhispererCoreConnection(conn)) {
                state[Features.codewhispererCore] = AuthStates.connected
            }
            if (isValidAmazonQConnection(conn)) {
                for (const v of Object.values(Features)) {
                    state[v as Feature] = AuthStates.connected
                }
            }
        }

        return state
    }

    /**
     * Edge Case: Due to a change in behaviour/functionality, there are potential extra
     * auth connections that the Amazon Q extension has cached. We need to remove these
     * as they are irrelevant to the Q extension and can cause issues.
     */
    public async clearExtraConnections(): Promise<void> {
        const currentQConn = this.conn
        // Q currently only maintains 1 connection at a time, so we assume everything else is extra.
        // IMPORTANT: In the case Q starts to manage multiple connections, this implementation will need to be updated.
        const allOtherConnections = (await this.auth.listConnections()).filter((c) => c.id !== currentQConn?.id)
        for (const conn of allOtherConnections) {
            getLogger().warn(`forgetting extra amazon q connection: %O`, conn)
            await telemetry.auth_modifyConnection.run(
                async () => {
                    telemetry.record({
                        connectionState: Auth.instance.getConnectionState(conn) ?? 'undefined',
                        source: asStringifiedStack(telemetry.getFunctionStack()),
                        ...(await getTelemetryMetadataForConn(conn)),
                    })

                    if (isInDevEnv()) {
                        telemetry.record({ action: 'forget' })
                        // in a Dev Env the connection may be used by code catalyst, so we forget instead of fully deleting
                        await this.auth.forgetConnection(conn)
                    } else {
                        telemetry.record({ action: 'delete' })
                        await this.auth.deleteConnection(conn)
                    }
                },
                { functionId: { name: 'clearExtraConnections', class: authClassName } }
            )
        }
    }
}

export type FeatureAuthState = { [feature in Feature]: AuthState }
export type Feature = (typeof Features)[keyof typeof Features]
export type AuthState = (typeof AuthStates)[keyof typeof AuthStates]

export const AuthStates = {
    /** The current connection is working and supports this feature. */
    connected: 'connected',
    /** No connection exists, so this feature cannot be used*/
    disconnected: 'disconnected',
    /**
     * The current connection exists, but needs to be reauthenticated for this feature to work
     *
     * Look to use {@link AuthUtil.reauthenticate()}
     */
    expired: 'expired',
    /**
     * A connection exists, but does not support this feature.
     *
     * Eg: We are currently using Builder ID, but must use Identity Center.
     */
    unsupported: 'unsupported',
    /**
     * The current connection exists and isn't expired,
     * but fetching/refreshing the token resulted in a network error.
     */
    connectedWithNetworkError: 'connectedWithNetworkError',
} as const
const Features = {
    codewhispererCore: 'codewhispererCore',
    codewhispererChat: 'codewhispererChat',
    amazonQ: 'amazonQ',
} as const

function buildFeatureAuthState(state: AuthState): FeatureAuthState {
    return {
        codewhispererCore: state,
        codewhispererChat: state,
        amazonQ: state,
    }
}
