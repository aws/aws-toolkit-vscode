/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import {
    Auth,
    createBuilderIdProfile,
    codewhispererScopes,
    isBuilderIdConnection,
    createSsoProfile,
    isSsoConnection,
    hasScopes,
} from '../../credentials/auth'
import { Connection, SsoConnection } from '../../credentials/auth'
import { ToolkitError } from '../../shared/errors'
import { getSecondaryAuth } from '../../credentials/secondaryAuth'
import { once } from '../../shared/utilities/functionUtils'
import { Commands } from '../../shared/vscode/commands2'
import { isCloud9 } from '../../shared/extensionUtilities'
import { TelemetryHelper } from './telemetryHelper'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

export const awsBuilderIdSsoProfile = createBuilderIdProfile()
// No connections are valid within C9 classic
export const isValidCodeWhispererConnection = (conn: Connection): conn is SsoConnection =>
    !isCloud9('classic') && isSsoConnection(conn) && hasScopes(conn, codewhispererScopes)

export class AuthUtil {
    static #instance: AuthUtil

    private usingEnterpriseSSO: boolean = false

    private readonly clearAccessToken = once(() =>
        globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
    )
    private readonly secondaryAuth = getSecondaryAuth('codewhisperer', 'CodeWhisperer', isValidCodeWhispererConnection)
    public readonly restore = () => this.secondaryAuth.restoreConnection()

    public constructor(public readonly auth = Auth.instance) {
        // codewhisperer uses sigv4 creds on C9 classic
        if (isCloud9('classic')) {
            return
        }

        this.secondaryAuth.onDidChangeActiveConnection(async conn => {
            if (conn?.type === 'sso') {
                if (this.auth.getConnectionState(conn) === 'valid') {
                    await this.clearAccessToken()
                }
                this.usingEnterpriseSSO = !isBuilderIdConnection(conn)
            } else {
                this.usingEnterpriseSSO = false
            }
            TelemetryHelper.instance.startUrl = this.conn?.startUrl
            await Promise.all([
                vscode.commands.executeCommand('aws.codeWhisperer.refresh'),
                vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode'),
                vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar'),
                vscode.commands.executeCommand('aws.codeWhisperer.updateReferenceLog'),
            ])
        })

        Commands.register('aws.codeWhisperer.removeConnection', () => this.secondaryAuth.removeConnection())
    }

    // current active cwspr connection
    public get conn() {
        return this.secondaryAuth.activeConnection
    }

    public get isUsingSavedConnection() {
        return this.conn !== undefined && this.secondaryAuth.isUsingSavedConnection
    }

    public isConnected(): boolean {
        return this.conn !== undefined
    }

    public isEnterpriseSsoInUse(): boolean {
        return this.conn !== undefined && this.usingEnterpriseSSO
    }

    public async connectToAwsBuilderId() {
        const existingConn = (await this.auth.listConnections()).find(
            (conn): conn is SsoConnection => isValidCodeWhispererConnection(conn) && isBuilderIdConnection(conn)
        )
        const conn = existingConn ?? (await this.auth.createConnection(awsBuilderIdSsoProfile))
        await this.secondaryAuth.useNewConnection(conn)
    }

    public async connectToEnterpriseSso(startUrl: string, region: string) {
        const existingConn = (await this.auth.listConnections()).find(
            (conn): conn is SsoConnection =>
                isSsoConnection(conn) && conn.startUrl.toLowerCase() === startUrl.toLowerCase()
        )

        if (!existingConn) {
            const conn = await this.auth.createConnection(createSsoProfile(startUrl, region))
            return this.secondaryAuth.useNewConnection(conn)
        } else if (isValidCodeWhispererConnection(existingConn)) {
            return this.secondaryAuth.useNewConnection(existingConn)
        } else if (isSsoConnection(existingConn)) {
            return this.promptUpgrade(existingConn, 'startUrl')
        }
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public async getBearerToken(): Promise<string> {
        await this.restore()

        if (this.conn === undefined) {
            throw new ToolkitError('No connection found', { code: 'NoConnection' })
        }

        const bearerToken = await this.conn.getToken()
        return bearerToken.accessToken
    }

    public isConnectionValid(): boolean {
        return this.conn !== undefined && !this.secondaryAuth.isConnectionExpired
    }

    public isConnectionExpired(): boolean {
        return (
            this.secondaryAuth.isConnectionExpired &&
            this.conn !== undefined &&
            isValidCodeWhispererConnection(this.conn)
        )
    }

    public async reauthenticate() {
        if (this.isConnectionExpired()) {
            try {
                await this.auth.reauthenticate(this.conn!)
            } catch (err) {
                throw ToolkitError.chain(err, 'Unable to authenticate connection')
            }
        }
    }

    public async showReauthenticatePrompt() {
        await vscode.window
            .showWarningMessage(CodeWhispererConstants.connectionExpired, 'Cancel', 'Learn More', 'Authenticate')
            .then(async resp => {
                if (resp === 'Learn More') {
                    vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
                } else if (resp === 'Authenticate') {
                    await this.reauthenticate()
                }
            })
    }

    #hasSeenUpgradeNotification = false
    public async promptUpgrade(existingConn: SsoConnection, upgradeType: 'current' | 'startUrl' | 'passive') {
        const modal = upgradeType === 'current' || upgradeType === 'startUrl'
        if (upgradeType !== 'startUrl' && this.#hasSeenUpgradeNotification) {
            return false
        }
        this.#hasSeenUpgradeNotification = upgradeType === 'startUrl' ? this.#hasSeenUpgradeNotification : true

        const message =
            upgradeType === 'startUrl'
                ? 'The provided start URL is associated with a connection that lacks permissions required by CodeWhisperer. Upgrading the connection will require another login.\n\nUpgrade now?'
                : 'The current connection lacks permissions required by CodeWhisperer. Upgrading the connection will require another login.\n\nUpgrade now?'

        const resp = await vscode.window.showWarningMessage(
            message,
            { modal },
            { title: 'Yes' },
            { title: 'No', isCloseAffordance: true }
        )
        if (resp?.title !== 'Yes') {
            throw new CancellationError('user')
        }

        const upgradedConn = await this.auth.createConnection(createSsoProfile(existingConn.startUrl))
        try {
            if (this.auth.activeConnection?.id === (existingConn as SsoConnection).id) {
                await this.auth.useConnection(upgradedConn)
            } else {
                await this.secondaryAuth.useNewConnection(upgradedConn)
            }
        } catch (err) {
            // Don't allow duplicates to exist on errors
            await this.auth.deleteConnection(upgradedConn)
            throw err
        }

        // This is non-breaking as codewhisperer is the only thing saving enterprise SSO connections at the moment
        await this.auth.deleteConnection(existingConn)

        return true
    }

    public hasAccessToken() {
        return !!globals.context.globalState.get(CodeWhispererConstants.accessToken)
    }
}

export const isUpgradeableConnection = (conn?: Connection): conn is SsoConnection =>
    !!conn && !isValidCodeWhispererConnection(conn) && isSsoConnection(conn)
