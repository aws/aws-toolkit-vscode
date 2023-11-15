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
    ssoAccountAccessScopes,
    scopesCodeWhispererChat,
    scopesWeaverbird,
    scopesGumby,
    isIdcSsoConnection,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger'

/** Backwards compatibility for connections w pre-chat scopes */
export const codeWhispererCoreScopes = [...ssoAccountAccessScopes, ...scopesCodeWhispererCore]
export const codeWhispererChatScopes = [...codeWhispererCoreScopes, ...scopesCodeWhispererChat]
export const amazonQScopes = [...codeWhispererChatScopes, ...scopesGumby, ...scopesWeaverbird]

export const awsBuilderIdSsoProfile = createBuilderIdProfile(codeWhispererChatScopes)

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

export class AuthUtil {
    static #instance: AuthUtil

    private usingEnterpriseSSO: boolean = false
    private reauthenticatePromptShown: boolean = false
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
        vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        vscode.commands.executeCommand('aws.amazonq.refresh')
        vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
    }

    public readonly secondaryAuth = getSecondaryAuth(
        this.auth,
        'codewhisperer',
        'CodeWhisperer',
        isValidCodeWhispererCoreConnection
    )
    public readonly restore = () => this.secondaryAuth.restoreConnection()

    public constructor(public readonly auth = Auth.instance) {
        this.auth.onDidChangeConnectionState(e => {
            if (e.state !== 'authenticating') {
                this.refreshCodeWhisperer()
            }
        })

        this.secondaryAuth.onDidChangeActiveConnection(async conn => {
            if (conn?.type === 'sso') {
                this.usingEnterpriseSSO = !isBuilderIdConnection(conn)
                if (!this.isConnectionExpired() && this.usingEnterpriseSSO) {
                    vscode.commands.executeCommand('aws.codeWhisperer.notifyNewCustomizations')
                }
            } else {
                this.usingEnterpriseSSO = false
            }
            await Promise.all([
                vscode.commands.executeCommand('aws.codeWhisperer.refresh'),
                vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode'),
                vscode.commands.executeCommand('aws.amazonq.refresh'),
                vscode.commands.executeCommand('aws.amazonq.refreshRootNode'),
                vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar'),
                vscode.commands.executeCommand('aws.codeWhisperer.updateReferenceLog'),
            ])
            const prompts = PromptSettings.instance

            const shouldShow = await prompts.isPromptEnabled('amazonQWelcomePage')
            // To check valid connection
            if (this.isValidEnterpriseSsoInUse() || (this.isBuilderIdInUse() && !this.isConnectionExpired())) {
                //If user login old or new, If welcome message is not shown then open the Getting Started Page after this mark it as SHOWN.
                if (shouldShow) {
                    prompts.disablePrompt('amazonQWelcomePage')
                    vscode.commands.executeCommand('aws.awsq.welcome')
                }
            }
            await vscode.commands.executeCommand('setContext', 'CODEWHISPERER_ENABLED', this.isConnected())
        })
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
        return this.conn !== undefined && this.usingEnterpriseSSO
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
            conn = await this.auth.createConnection(awsBuilderIdSsoProfile)
        } else if (!isValidCodeWhispererChatConnection(conn)) {
            conn = await this.secondaryAuth.addScopes(conn, codeWhispererChatScopes)
        }

        if (this.auth.getConnectionState(conn) === 'invalid') {
            conn = await this.auth.reauthenticate(conn)
        }

        return this.secondaryAuth.useNewConnection(conn)
    }

    public async connectToEnterpriseSso(startUrl: string, region: string) {
        const existingConn = (await this.auth.listConnections()).find(
            (conn): conn is SsoConnection =>
                isSsoConnection(conn) && conn.startUrl.toLowerCase() === startUrl.toLowerCase()
        )

        if (!existingConn) {
            const conn = await this.auth.createConnection(createSsoProfile(startUrl, region, amazonQScopes))
            return this.secondaryAuth.useNewConnection(conn)
        } else if (isValidAmazonQConnection(existingConn)) {
            return this.secondaryAuth.useNewConnection(existingConn)
        } else if (isSsoConnection(existingConn)) {
            const conn = await this.secondaryAuth.addScopes(existingConn, amazonQScopes)
            return this.secondaryAuth.useNewConnection(conn)
        }
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
        getLogger().debug(`codewhisperer: Connection is valid = ${connectionValid}, 
                            connection is undefined = ${this.conn === undefined},
                            secondaryAuth connection expired = ${this.secondaryAuth.isConnectionExpired}`)
        return connectionValid
    }

    public isConnectionExpired(): boolean {
        const connectionExpired =
            this.secondaryAuth.isConnectionExpired &&
            this.conn !== undefined &&
            isValidCodeWhispererCoreConnection(this.conn)
        getLogger().debug(`codewhisperer: Connection expired = ${connectionExpired},
                           secondaryAuth connection expired = ${this.secondaryAuth.isConnectionExpired},
                           connection is undefined = ${this.conn === undefined}`)
        if (this.conn) {
            getLogger().debug(
                `codewhisperer: isValidCodeWhispererConnection = ${isValidCodeWhispererCoreConnection(this.conn)}`
            )
        }
        return connectionExpired
    }

    public async reauthenticate() {
        try {
            // Edge Case: With the addition of Amazon Q/Chat scopes we may need to add
            // the new scopes to existing connections.
            if (this.conn?.type === 'sso') {
                if (isBuilderIdConnection(this.conn) && !isValidCodeWhispererChatConnection(this.conn)) {
                    const conn = await this.secondaryAuth.addScopes(this.conn, codeWhispererChatScopes)
                    this.secondaryAuth.useNewConnection(conn)
                } else if (isIdcSsoConnection(this.conn) && !isValidAmazonQConnection(this.conn)) {
                    const conn = await this.secondaryAuth.addScopes(this.conn, amazonQScopes)
                    this.secondaryAuth.useNewConnection(conn)
                }
            }

            await this.auth.reauthenticate(this.conn!)
        } catch (err) {
            throw ToolkitError.chain(err, 'Unable to authenticate connection')
        }
    }

    public async refreshCodeWhisperer() {
        await Promise.all([
            vscode.commands.executeCommand('aws.codeWhisperer.refresh'),
            vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode'),
            vscode.commands.executeCommand('aws.amazonq.refresh'),
            vscode.commands.executeCommand('aws.amazonq.refreshRootNode'),
            vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar'),
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
                    settings.disablePrompt('codeWhispererConnectionExpired')
                }
            })
        if (isAutoTrigger) {
            this.reauthenticatePromptShown = true
        }
    }

    public async notifyReauthenticate(isAutoTrigger?: boolean) {
        this.showReauthenticatePrompt(isAutoTrigger)
    }

    /**
     * Determines whether or not the current CodeWhisperer credential is active or not, with a display message.
     *
     * @returns a credentialState with a display message and whether to run a full authorization or reauth,
     *          or undefined if the credential is valid.
     */
    public async getCodeWhispererCredentialState(): Promise<CWCredentialState | undefined> {
        const auth = AuthUtil.instance
        const curr = auth.conn
        if (!curr) {
            return {
                message: 'No connection to Amazon Q (Preview). Sign into CodeWhisperer.',
                fullAuth: true,
            }
        } else if (!isValidAmazonQConnection(curr)) {
            return {
                message:
                    'Existing Amazon Q (Preview) connection does not have required scopes. Sign into CodeWhisperer.',
                fullAuth: true,
            }
        } else if (auth.isConnectionExpired()) {
            return {
                message: 'Connection to Amazon Q (Preview) has expired. Reauthorize with CodeWhisperer.',
                fullAuth: false,
            }
        } else if (!auth.isConnectionValid()) {
            return {
                message: 'Connection to Amazon Q (Preview) is invalid. Reauthorize with CodeWhisperer.',
                fullAuth: false,
            }
        }

        return undefined
    }
}

export type CWCredentialState = {
    message: string
    fullAuth: boolean
}

/**
 * Returns a snapshot of the overall auth state of
 * CodeWhisperer + Chat features.
 */
export function getChatAuthState(cwAuth = AuthUtil.instance): FeatureAuthState {
    const currentConnection = cwAuth.conn

    // base cases
    if (currentConnection === undefined) {
        return buildFeatureAuthState(AuthStates.disconnected)
    }
    if (!isSsoConnection(currentConnection)) {
        throw new ToolkitError(`Connection is not a valid type: ${currentConnection}`)
    }

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

export type FeatureAuthState = { [feature in Feature]: AuthState }
export type Feature = (typeof Features)[keyof typeof Features]
export type AuthState = (typeof AuthStates)[keyof typeof AuthStates]

export const AuthStates = {
    connected: 'connected',
    /** No connection exists */
    disconnected: 'disconnected',
    /** Connection exists, but needs to be reauthenticated */
    expired: 'expired',
    /** Feature is unsupported with the current connection type */
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
