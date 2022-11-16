/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Auth, SsoProfile, getSsoProfileKey } from '../../credentials/auth'
import { Connection } from '../../credentials/auth'
import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../models/constants'

import { createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createExitButton } from '../../shared/ui/buttons'
import { ToolkitError } from '../../shared/errors'

export const awsBuilderIdSsoProfile = {
    startUrl: 'https://view.awsapps.com/start',
    ssoRegion: 'us-east-1',
    scopes: ['codewhisperer:ide:recommendations'],
    type: 'sso' as const,
}
//TODO Switch between SSO & Sono profile
export class AuthUtil {
    static #instance: AuthUtil

    private usingEnterpriseSSO: boolean = false

    // current active cwspr connection
    private conn?: Connection = undefined

    public constructor(public readonly auth = Auth.instance) {
        this.auth.onDidChangeActiveConnection(async conn => this.handleConnectionChange(conn))
    }

    private async handleConnectionChange(conn: Connection | undefined) {
        if (conn?.type === 'sso') {
            getLogger().debug(`User switch to sso`)
            await globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
            this.conn = conn
            this.usingEnterpriseSSO = !conn.id.startsWith(awsBuilderIdSsoProfile.startUrl)
            await vscode.commands.executeCommand('aws.codeWhisperer.updateReferenceLog')
            await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
        } else if (conn?.type === 'iam') {
            getLogger().debug(`User switch to iam`)
            // when user switch to iam connection,
            // do not set this.conn, continue using previous SSO connection
            await this.onSwitchToUnsupportedConnection()
        } else {
            // TODO: this receiver is not getting any event
            getLogger().debug(`User sign out`)
            this.conn = undefined
            await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
        }
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        await vscode.commands.executeCommand('aws.codeWhisperer.refreshStatusBar')
    }

    private getOnSwitchConnectionQuickpick(): QuickPickPrompter<void> {
        const connName = this.isEnterpriseSsoInUse() ? 'IAM Identity Center' : 'Builder ID'
        const connLabel = this.isEnterpriseSsoInUse() ? this.conn?.label : undefined
        const connURL = connLabel?.replace('SSO (https://', '').replace('.awsapps.com/start)', '')
        const connStringFull = this.isEnterpriseSsoInUse() ? `${connName} (${connURL})` : connName
        const yesItem = {
            label: `Yes, use CodeWhisperer with ${connName} while using IAM with other services.`,

            data: async () => {
                await globals.context.globalState.update(CodeWhispererConstants.switchProfileKeepConnectionKey, 'yes')
                await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
                await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
                await vscode.window.showInformationMessage(`Codewhisperer will now always use ${connStringFull}.`)
            },
            detail: 'You can disconnect from CodeWhisperer later.',
        }
        const noItem = {
            label: 'No, disconnect from CodeWhisperer and use IAM for other services.',
            data: async () => {
                this.conn = undefined
                await globals.context.globalState.update(CodeWhispererConstants.switchProfileKeepConnectionKey, 'no')
                await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
                await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            },
            detail: 'You can reconnect to CodeWhisperer later.',
        }

        const items = [yesItem, noItem]

        const prompter = createQuickPick(items, {
            title: `Stay connected to CodeWhisperer with ${connStringFull}?`,
            buttons: [createExitButton()],
        })
        return prompter
    }

    private async onSwitchToUnsupportedConnection() {
        if (this.conn === undefined) {
            return
        }
        // skip the prompt if user has made selection or current connection is invalid
        const selection = globals.context.globalState.get<string | undefined>(
            CodeWhispererConstants.switchProfileKeepConnectionKey
        )
        if (selection) {
            if (selection === 'no') {
                this.conn = undefined
            }
            await vscode.commands.executeCommand('aws.codeWhisperer.refreshRootNode')
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
            return
        }
        const prompter = this.getOnSwitchConnectionQuickpick()
        await prompter.prompt()
    }

    public isConnected(): boolean {
        return this.conn !== undefined
    }

    public isEnterpriseSsoInUse(): boolean {
        return this.usingEnterpriseSSO
    }

    public async connectToAwsBuilderId() {
        const id = getSsoProfileKey(awsBuilderIdSsoProfile)
        this.conn = await this.auth.getConnection({ id: id })
        if (this.conn === undefined) {
            this.conn = await this.auth.createConnection(awsBuilderIdSsoProfile)
        }
        this.auth.useConnection(this.conn)
        this.usingEnterpriseSSO = false
        await globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
    }

    public async connectToEnterpriseSso(startUrl: string) {
        const profile: SsoProfile = {
            startUrl: startUrl,
            ssoRegion: 'us-east-1',
            scopes: ['codewhisperer:ide:recommendations'],
            type: 'sso',
        }
        const id = getSsoProfileKey(profile)
        this.conn = await this.auth.getConnection({ id: id })
        if (this.conn === undefined) {
            this.conn = await this.auth.createConnection(profile)
        }
        this.auth.useConnection(this.conn)
        this.usingEnterpriseSSO = true
        await globals.context.globalState.update(CodeWhispererConstants.accessToken, undefined)
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public async getBearerToken(): Promise<string> {
        if (this.conn?.type === 'sso') {
            const bearerToken = await this.conn?.getToken()
            return bearerToken.accessToken
        }
        throw Error(`Invalid connection ${this.conn}`)
    }

    public isConnectionValid(): boolean {
        return (
            this.conn !== undefined &&
            this.conn.type === 'sso' &&
            this.conn.scopes !== undefined &&
            this.conn.scopes.includes(awsBuilderIdSsoProfile.scopes[0]) &&
            this.auth.getConnectionState(this.conn.id) === 'valid'
        )
    }

    public isConnectionExpired(): boolean {
        return (
            this.conn !== undefined &&
            this.conn.type === 'sso' &&
            ['invalid', 'unauthenticated'].includes(this.auth.getConnectionState(this.conn.id))
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
                    await AuthUtil.instance.reauthenticate()
                }
            })
    }
}
