/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { Auth } from '../../auth/auth'
import { ToolkitError } from '../../shared/errors'
import { getSecondaryAuth } from '../../auth/secondaryAuth'
import { Commands } from '../../shared/vscode/commands2'
import { isCloud9 } from '../../shared/extensionUtilities'
import { PromptSettings } from '../../shared/settings'
import {
    ssoAccountAccessScopes,
    codewhispererScopes,
    createBuilderIdProfile,
    hasScopes,
    SsoConnection,
    createSsoProfile,
    Connection,
    isIamConnection,
    isSsoConnection,
    isBuilderIdConnection,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger'

export const defaultCwScopes = [...ssoAccountAccessScopes, ...codewhispererScopes]
export const awsBuilderIdSsoProfile = createBuilderIdProfile(defaultCwScopes)

export const isValidCodeWhispererConnection = (conn: Connection): conn is Connection => {
    if (isCloud9('classic')) {
        return isIamConnection(conn)
    }

    return (
        (isCloud9('codecatalyst') && isIamConnection(conn)) ||
        (isSsoConnection(conn) && hasScopes(conn, codewhispererScopes))
    )
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
        vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
    }

    public readonly secondaryAuth = getSecondaryAuth(
        this.auth,
        'codewhisperer',
        'CodeWhisperer',
        isValidCodeWhispererConnection
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
                vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar'),
                vscode.commands.executeCommand('aws.codeWhisperer.updateReferenceLog'),
            ])
            const prompts = PromptSettings.instance

            const shouldShow = await prompts.isPromptEnabled('codeWhispererNewWelcomeMessage')
            // To check valid connection
            if (this.isValidEnterpriseSsoInUse() || (this.isBuilderIdInUse() && !this.isConnectionExpired())) {
                //If user login old or new, If welcome message is not shown then open the Getting Started Page after this mark it as SHOWN.
                if (shouldShow) {
                    vscode.commands.executeCommand('aws.codeWhisperer.gettingStarted')
                    prompts.disablePrompt('codeWhispererNewWelcomeMessage')
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
        } else if (!isValidCodeWhispererConnection(conn)) {
            conn = await this.secondaryAuth.addScopes(conn, defaultCwScopes)
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
            const conn = await this.auth.createConnection(createSsoProfile(startUrl, region, defaultCwScopes))
            return this.secondaryAuth.useNewConnection(conn)
        } else if (isValidCodeWhispererConnection(existingConn)) {
            return this.secondaryAuth.useNewConnection(existingConn)
        } else if (isSsoConnection(existingConn)) {
            const conn = await this.secondaryAuth.addScopes(existingConn, defaultCwScopes)
            return this.secondaryAuth.useNewConnection(conn)
        }
    }

    public static get instance() {
        if (this.#instance !== undefined) {
            return this.#instance
        }

        const self = (this.#instance = new this())
        Commands.register('aws.codeWhisperer.removeConnection', () => self.secondaryAuth.removeConnection())

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
            isValidCodeWhispererConnection(this.conn)
        getLogger().debug(`codewhisperer: Connection expired = ${connectionExpired},
                           secondaryAuth connection expired = ${this.secondaryAuth.isConnectionExpired},
                           connection is undefined = ${this.conn === undefined}`)
        if (this.conn) {
            getLogger().debug(
                `codewhisperer: isValidCodeWhispererConnection = ${isValidCodeWhispererConnection(this.conn)}`
            )
        }
        return connectionExpired
    }

    public async reauthenticate() {
        try {
            await this.auth.reauthenticate(this.conn!)
        } catch (err) {
            throw ToolkitError.chain(err, 'Unable to authenticate connection')
        }
    }

    public async refreshCodeWhisperer() {
        await Promise.all([
            vscode.commands.executeCommand('aws.codeWhisperer.refresh'),
            vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode'),
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
}
