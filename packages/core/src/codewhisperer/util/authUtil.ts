/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { Auth } from '../../auth/auth'
import { ToolkitError } from '../../shared/errors'
import { getSecondaryAuth } from '../../auth/secondaryAuth'
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
    AwsConnection,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger'
import { Commands } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'
import { onceChanged, once } from '../../shared/utilities/functionUtils'
import { indent } from '../../shared/utilities/textUtilities'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import { showAmazonQWalkthroughOnce } from '../../amazonq/onboardingPage/walkthrough'

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

    if (isSageMaker()) {
        return isIamConnection(conn)
    }

    return (
        (isCloud9('codecatalyst') && isIamConnection(conn)) ||
        (isSsoConnection(conn) && hasScopes(conn, codeWhispererCoreScopes))
    )
}
/** Superset that includes all of CodeWhisperer + Amazon Q */
export const isValidAmazonQConnection = (conn?: Connection): conn is Connection => {
    return (
        (isSsoConnection(conn) || isBuilderIdConnection(conn)) &&
        isValidCodeWhispererCoreConnection(conn) &&
        hasScopes(conn, amazonQScopes)
    )
}

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
        this.auth.onDidChangeConnectionState(async e => {
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

            await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connected', this.isConnected())

            // To check valid connection
            if (this.isValidEnterpriseSsoInUse() || (this.isBuilderIdInUse() && !this.isConnectionExpired())) {
                // start the feature config polling job
                await vscode.commands.executeCommand('aws.amazonq.fetchFeatureConfigs')
            }
            await this.setVscodeContextProps()
        })
    })

    public async setVscodeContextProps() {
        if (isCloud9()) {
            return
        }

        await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connected', this.isConnected())
        const doShowAmazonQLoginView = !this.isConnected() || this.isConnectionExpired()
        await vscode.commands.executeCommand('setContext', 'aws.amazonq.showLoginView', doShowAmazonQLoginView)
        await vscode.commands.executeCommand(
            'setContext',
            'aws.codewhisperer.connectionExpired',
            this.isConnectionExpired()
        )
    }

    /* Callback used by Amazon Q to delete connection status & scope when this deletion is made by AWS Toolkit
     ** 1. NO event should be emitted from this deletion
     ** 2. Should update the context key to update UX
     */
    public async onDeleteConnection(id: string) {
        await this.secondaryAuth.onDeleteConnection(id)
        await this.setVscodeContextProps()
        await vscode.commands.executeCommand('aws.amazonq.refreshStatusBar')
    }

    /* Callback used by Amazon Q to delete connection status & scope when this deletion is made by AWS Toolkit
     ** 1. NO event should be emitted from this deletion
     ** 2. Should update the context key to update UX
     */
    public async onUpdateConnection(connection: AwsConnection) {
        await this.auth.onConnectionUpdate(connection)
        await this.setVscodeContextProps()
        await vscode.commands.executeCommand('aws.amazonq.refreshStatusBar')
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

    public async connectToAwsBuilderId() {
        let conn = (await this.auth.listConnections()).find(isBuilderIdConnection)

        if (!conn) {
            conn = await this.auth.createConnection(createBuilderIdProfile(amazonQScopes))
        } else if (!isValidAmazonQConnection(conn)) {
            conn = await this.secondaryAuth.addScopes(conn, amazonQScopes)
        }

        if (this.auth.getConnectionState(conn) === 'invalid') {
            conn = await this.auth.reauthenticate(conn)
        }

        await showAmazonQWalkthroughOnce()

        return this.secondaryAuth.useNewConnection(conn)
    }

    public async connectToEnterpriseSso(startUrl: string, region: string) {
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

        await showAmazonQWalkthroughOnce()

        return this.secondaryAuth.useNewConnection(conn)
    }

    public static get instance() {
        if (this.#instance !== undefined) {
            return this.#instance
        }

        const self = (this.#instance = new this())
        return self
    }

    public async getBearerToken(): Promise<string> {
        await this.restore()

        if (this.conn === undefined) {
            throw new ToolkitError('No connection found', { code: 'NoConnection' })
        }

        if (!isSsoConnection(this.conn)) {
            throw new ToolkitError('Connection is not an SSO connection', { code: 'BadConnectionType' })
        }

        const bearerToken = await this.conn.getToken()
        return bearerToken.accessToken
    }

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

    public async reauthenticate(addMissingScopes: boolean = false) {
        try {
            if (this.conn?.type !== 'sso') {
                return
            }

            // Edge Case: With the addition of Amazon Q/Chat scopes we may need to add
            // the new scopes to existing pre-chat connections.
            if (addMissingScopes) {
                if (
                    (isBuilderIdConnection(this.conn) || isIdcSsoConnection(this.conn)) &&
                    !isValidAmazonQConnection(this.conn)
                ) {
                    const conn = await this.secondaryAuth.addScopes(this.conn, amazonQScopes)
                    await this.secondaryAuth.useNewConnection(conn)
                    return
                }
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
     */
    public async getChatAuthState(): Promise<FeatureAuthState> {
        // The state of the connection may not have been properly validated
        // and the current state we see may be stale, so refresh for latest state.
        await this.auth.refreshConnectionState(this.conn)
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
        if (!isSsoConnection(conn)) {
            throw new ToolkitError(`Connection "${conn.id}" is not a valid type: ${conn.type}`)
        }

        // default to expired to indicate reauth is needed if unmodified
        const state: FeatureAuthState = buildFeatureAuthState(AuthStates.expired)

        if (this.isConnectionExpired()) {
            return state
        }

        if (isBuilderIdConnection(conn) || isIdcSsoConnection(conn)) {
            if (isValidCodeWhispererCoreConnection(conn)) {
                state[Features.codewhispererCore] = AuthStates.connected
            }
            if (isValidAmazonQConnection(conn)) {
                Object.values(Features).forEach(v => (state[v as Feature] = AuthStates.connected))
            }
        }

        return state
    }

    /**
     * From the given connections, returns a connection that works with Amazon Q.
     */
    findUsableQConnection(connections: AwsConnection[]): AwsConnection | undefined {
        const hasQScopes = (c: AwsConnection) => amazonQScopes.every(s => c.scopes?.includes(s))
        const score = (c: AwsConnection) => Number(hasQScopes(c)) * 10 + Number(c.state === 'valid')
        connections.sort(function (a, b) {
            return score(b) - score(a)
        })
        if (hasQScopes(connections[0])) {
            return connections[0]
        }
        return undefined
    }
}

/**
 * Returns true if an SSO connection with AmazonQ and CodeWhisperer scopes are found,
 * even if the connection is expired.
 *
 * Note: This function will become irrelevant if/when the Amazon Q view tree is removed
 * from the toolkit.
 */
export function isPreviousQUser() {
    const auth = AuthUtil.instance

    if (!auth.isConnected() || !isSsoConnection(auth.conn)) {
        return false
    }
    const missingScopes =
        (auth.isEnterpriseSsoInUse() && !hasScopes(auth.conn, amazonQScopes)) ||
        !hasScopes(auth.conn, codeWhispererChatScopes)

    if (missingScopes) {
        return false
    }

    return true
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
