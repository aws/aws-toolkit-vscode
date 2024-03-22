/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { Auth } from '../../auth/auth'
import { ToolkitError } from '../../shared/errors'
import { getSecondaryAuth } from '../../auth/secondaryAuth'
import { isCloud9, isSageMaker } from '../../shared/extensionUtilities'
import { PromptSettings } from '../../shared/settings'
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
    scopesSsoAccountAccess,
    scopesCodeWhispererChat,
    scopesFeatureDev,
    scopesGumby,
    isIdcSsoConnection,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger'
import { getCodeCatalystDevEnvId } from '../../shared/vscode/env'
import { Commands, placeholder } from '../../shared/vscode/commands2'
import { GlobalState } from '../../shared/globalState'
import { vsCodeState } from '../models/model'

/** Backwards compatibility for connections w pre-chat scopes */
export const codeWhispererCoreScopes = [...scopesSsoAccountAccess, ...scopesCodeWhispererCore]
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
/** For Builder ID only, if using IdC then use {@link isValidAmazonQConnection} */
export const isValidCodeWhispererChatConnection = (conn?: Connection): conn is Connection => {
    return (
        isBuilderIdConnection(conn) &&
        isValidCodeWhispererCoreConnection(conn) &&
        hasScopes(conn, codeWhispererChatScopes)
    )
}

/** Superset that includes all of CodeWhisperer + Amazon Q */
export const isValidAmazonQConnection = (conn?: Connection): conn is Connection => {
    return isSsoConnection(conn) && isValidCodeWhispererCoreConnection(conn) && hasScopes(conn, amazonQScopes)
}

interface HasAlreadySeenQWelcome {
    local?: boolean
    devEnv?: boolean
    ssh?: boolean
    wsl?: boolean
}

export class AuthUtil {
    static #instance: AuthUtil

    private reauthenticatePromptShown: boolean = false
    private _isCustomizationFeatureEnabled: boolean = false
    private readonly mementoKey: string = 'hasAlreadySeenQWelcomeObj'

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
        void Commands.tryExecute('aws.amazonq.refresh')
        void Commands.tryExecute('aws.codeWhisperer.refreshStatusBar')
    }

    public readonly secondaryAuth = getSecondaryAuth(
        this.auth,
        'codewhisperer',
        'CodeWhisperer',
        isValidCodeWhispererCoreConnection
    )
    public readonly restore = () => this.secondaryAuth.restoreConnection()

    public constructor(public readonly auth = Auth.instance) {
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
                void vscode.commands.executeCommand('aws.codeWhisperer.notifyNewCustomizations')
            }
            vsCodeState.isFreeTierLimitReached = false
            await Promise.all([
                // onDidChangeActiveConnection may trigger before these modules are activated.
                Commands.tryExecute('aws.amazonq.refresh'),
                Commands.tryExecute('aws.amazonq.refreshRootNode'),
                Commands.tryExecute('aws.codeWhisperer.refreshStatusBar'),
                Commands.tryExecute('aws.codeWhisperer.updateReferenceLog'),
            ])

            await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connected', this.isConnected())

            const shouldShowObject: HasAlreadySeenQWelcome = GlobalState.instance.get(this.mementoKey) ?? {
                local: false,
                devEnv: false,
                ssh: false,
                wsl: false,
            }
            // To check valid connection
            if (this.isValidEnterpriseSsoInUse() || (this.isBuilderIdInUse() && !this.isConnectionExpired())) {
                //If user login old or new, If welcome message is not shown then open the Getting Started Page after this mark it as SHOWN.
                const key = getEnvType()
                if (!shouldShowObject[key]) {
                    shouldShowObject[key] = true
                    GlobalState.instance.tryUpdate(this.mementoKey, shouldShowObject)
                    await vscode.commands.executeCommand('aws.amazonq.welcome', placeholder, key)
                }

                // start the feature config polling job
                await vscode.commands.executeCommand('aws.codeWhisperer.fetchFeatureConfigs')
            }
            await this.setVscodeContextProps()
        })
    }

    public async setVscodeContextProps() {
        if (!isCloud9()) {
            await vscode.commands.executeCommand('setContext', 'aws.codewhisperer.connected', this.isConnected())
            await vscode.commands.executeCommand(
                'setContext',
                'aws.codewhisperer.connectionExpired',
                this.isConnectionExpired()
            )
            await vscode.commands.executeCommand(
                'setContext',
                'aws.amazonq.hasConnections',
                Auth.instance.hasConnections
            )
        }
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
            conn = await this.auth.createConnection(createBuilderIdProfile(codeWhispererChatScopes))
        } else if (!isValidCodeWhispererChatConnection(conn)) {
            conn = await this.secondaryAuth.addScopes(conn, codeWhispererChatScopes)
        }

        if (this.auth.getConnectionState(conn) === 'invalid') {
            conn = await this.auth.reauthenticate(conn)
        }

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

    public isConnectionValid(): boolean {
        const connectionValid = this.conn !== undefined && !this.secondaryAuth.isConnectionExpired
        if (connectionValid === false) {
            getLogger().debug(`codewhisperer: Connection is valid = ${connectionValid}, 
                            connection is undefined = ${this.conn === undefined},
                            secondaryAuth connection expired = ${this.secondaryAuth.isConnectionExpired}`)
        }

        return connectionValid
    }

    public isConnectionExpired(): boolean {
        const connectionExpired =
            this.secondaryAuth.isConnectionExpired &&
            this.conn !== undefined &&
            isValidCodeWhispererCoreConnection(this.conn)
        getLogger().info(`codewhisperer: Connection expired = ${connectionExpired},
                           secondaryAuth connection expired = ${this.secondaryAuth.isConnectionExpired},
                           connection is undefined = ${this.conn === undefined}`)
        if (this.conn) {
            getLogger().info(
                `codewhisperer: isValidCodeWhispererConnection = ${isValidCodeWhispererCoreConnection(this.conn)}`
            )
        }
        return connectionExpired
    }

    public async reauthenticate(addMissingScopes: boolean = false) {
        try {
            if (this.conn?.type !== 'sso') {
                return
            }

            // Edge Case: With the addition of Amazon Q/Chat scopes we may need to add
            // the new scopes to existing pre-chat connections.
            if (addMissingScopes) {
                if (isBuilderIdConnection(this.conn) && !isValidCodeWhispererChatConnection(this.conn)) {
                    const conn = await this.secondaryAuth.addScopes(this.conn, codeWhispererChatScopes)
                    await this.secondaryAuth.useNewConnection(conn)
                    return
                } else if (isIdcSsoConnection(this.conn) && !isValidAmazonQConnection(this.conn)) {
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
        await Promise.all([
            Commands.tryExecute('aws.amazonq.refresh'),
            Commands.tryExecute('aws.amazonq.refreshRootNode'),
            Commands.tryExecute('aws.codeWhisperer.refreshStatusBar'),
        ])
    }

    public async showReauthenticatePrompt(isAutoTrigger?: boolean) {
        const settings = PromptSettings.instance
        const shouldShow = await settings.isPromptEnabled('codeWhispererConnectionExpired')
        if (!shouldShow || (isAutoTrigger && this.reauthenticatePromptShown)) {
            return
        }

        await vscode.window
            .showInformationMessage(
                CodeWhispererConstants.connectionExpired,
                CodeWhispererConstants.connectWithAWSBuilderId,
                CodeWhispererConstants.DoNotShowAgain
            )
            .then(async resp => {
                if (resp === CodeWhispererConstants.connectWithAWSBuilderId) {
                    await this.reauthenticate()
                } else if (resp === CodeWhispererConstants.DoNotShowAgain) {
                    await settings.disablePrompt('codeWhispererConnectionExpired')
                }
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
        return this.isEnterpriseSsoInUse() && this.isConnectionValid()
    }
}

/**
 * Returns a snapshot of the overall auth state of
 * CodeWhisperer + Chat features.
 */
export async function getChatAuthState(cwAuth = AuthUtil.instance): Promise<FeatureAuthState> {
    const currentConnection = cwAuth.conn

    if (currentConnection === undefined) {
        return buildFeatureAuthState(AuthStates.disconnected)
    }
    if (!isSsoConnection(currentConnection)) {
        throw new ToolkitError(`Connection "${currentConnection.id}" is not a valid type: ${currentConnection.type}`)
    }

    // The state of the connection may not have been properly validated
    // and the current state we see may be stale, so refresh for latest state.
    await cwAuth.auth.refreshConnectionState(currentConnection)

    // default to expired to indicate reauth is needed if unmodified
    const state: FeatureAuthState = buildFeatureAuthState(AuthStates.expired)

    if (isBuilderIdConnection(currentConnection)) {
        // Regardless, if using Builder ID, Amazon Q is unsupported
        state[Features.amazonQ] = AuthStates.unsupported
    }

    if (cwAuth.isConnectionExpired()) {
        return state
    }

    if (isBuilderIdConnection(currentConnection)) {
        if (isValidCodeWhispererCoreConnection(currentConnection)) {
            state[Features.codewhispererCore] = AuthStates.connected
        }
        if (isValidCodeWhispererChatConnection(currentConnection)) {
            state[Features.codewhispererChat] = AuthStates.connected
        }
    } else if (isIdcSsoConnection(currentConnection)) {
        if (isValidCodeWhispererCoreConnection(currentConnection)) {
            state[Features.codewhispererCore] = AuthStates.connected
        }
        if (isValidAmazonQConnection(currentConnection)) {
            Object.values(Features).forEach(v => (state[v as Feature] = AuthStates.connected))
        }
    }

    return state
}

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
     * Look to use {@link AuthUtil.reauthenticate}
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

function getEnvType(): keyof HasAlreadySeenQWelcome {
    const remoteName = vscode.env.remoteName
    if (remoteName) {
        if (remoteName === 'ssh-remote') {
            if (getCodeCatalystDevEnvId()) {
                return 'devEnv'
            }
            return 'ssh'
        }
        return 'wsl'
    }
    return 'local'
}
