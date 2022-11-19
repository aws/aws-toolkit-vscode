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
} from '../../credentials/auth'
import { Connection, SsoConnection } from '../../credentials/auth'
import { ToolkitError } from '../../shared/errors'
import { getSecondaryAuth } from '../../credentials/secondaryAuth'
import { once } from '../../shared/utilities/functionUtils'
import { Commands } from '../../shared/vscode/commands2'
import { isCloud9 } from '../../shared/extensionUtilities'

export const awsBuilderIdSsoProfile = createBuilderIdProfile()
// No connections are valid within C9
const isValidCodeWhispererConnection = (conn: Connection): conn is SsoConnection =>
    !isCloud9() && conn.type === 'sso' && codewhispererScopes.every(s => conn.scopes?.includes(s))

export class AuthUtil {
    static #instance: AuthUtil

    private usingEnterpriseSSO: boolean = false

    private readonly clearAccessToken = once(() =>
        globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
    )
    private readonly secondaryAuth = getSecondaryAuth('codewhisperer', 'CodeWhisperer', isValidCodeWhispererConnection)
    public readonly restore = () => this.secondaryAuth.restoreConnection()

    public constructor(public readonly auth = Auth.instance) {
        // codewhisperer uses sigv4 creds on C9
        if (isCloud9()) {
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

    public async connectToEnterpriseSso(startUrl: string) {
        const existingConn = (await this.auth.listConnections()).find(
            (conn): conn is SsoConnection => isValidCodeWhispererConnection(conn) && conn.startUrl === startUrl
        )
        const conn = existingConn ?? (await this.auth.createConnection(createSsoProfile(startUrl)))
        await this.secondaryAuth.useNewConnection(conn)
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
        return this.secondaryAuth.isConnectionExpired
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
}
