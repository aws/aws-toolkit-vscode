/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { tryAddCredentials } from '../../../../auth/utils'
import { getLogger } from '../../../../shared/logger'
import { AuthError, CommonAuthWebview } from '../backend'
import { AwsConnection, createSsoProfile, scopesCodeCatalyst } from '../../../../auth/connection'
import { Auth } from '../../../../auth/auth'
import { CodeCatalystAuthenticationProvider } from '../../../../codecatalyst/auth'

export class ToolkitLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.toolkit.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/toolkit/index.js'
    private isCodeCatalystLogin = false

    constructor(private readonly codeCatalystAuth: CodeCatalystAuthenticationProvider) {
        super(ToolkitLoginWebview.sourcePath)
    }

    setLoginService(serviceToShow?: string) {
        this.isCodeCatalystLogin = serviceToShow === 'codecatalyst'
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        if (this.isCodeCatalystLogin) {
            return this.ssoSetup('startCodeCatalystSSOSetup', async () => {
                await this.codeCatalystAuth.connectToEnterpriseSso(startUrl, region)
                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                await this.showResourceExplorer()
            })
        }
        return this.ssoSetup('createIdentityCenterConnection', async () => {
            const ssoProfile = createSsoProfile(startUrl, region)
            const conn = await Auth.instance.createConnection(ssoProfile)
            await Auth.instance.useConnection(conn)
            await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
            void vscode.window.showInformationMessage('Toolkit: Successfully connected to AWS IAM Identity Center')
            void this.showResourceExplorer()
        })
    }

    async startIamCredentialSetup(
        profileName: string,
        accessKey: string,
        secretKey: string
    ): Promise<AuthError | undefined> {
        // See submitData() in manageCredentials.vue
        const data = { aws_access_key_id: accessKey, aws_secret_access_key: secretKey }
        const error = await this.getAuthenticatedCredentialsError(data)
        if (error) {
            return { id: this.id, text: error.error }
        }
        try {
            await tryAddCredentials(profileName, data, true)
            await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
            await this.showResourceExplorer()
            return
        } catch (e) {
            getLogger().error('Failed submitting credentials', e)
            return { id: this.id, text: e as string }
        }
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeCatalystBuilderIdSetup', async () => {
            await this.codeCatalystAuth.connectToAwsBuilderId()
            await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
            await this.showResourceExplorer()
        })
    }

    async errorNotification(e: AuthError) {
        await vscode.window.showInformationMessage(`${e.text}`)
    }

    async fetchConnections(): Promise<AwsConnection[] | undefined> {
        const connections: AwsConnection[] = []
        const _connections = await Auth.instance.listConnections()
        _connections.forEach(c => {
            const status = Auth.instance.getConnectionState({ id: c.id })
            if (c.label.startsWith('AmazonQ') && c.type === 'sso' && status) {
                connections.push({
                    id: c.id,
                    label: c.label,
                    type: c.type,
                    ssoRegion: c.ssoRegion,
                    startUrl: c.startUrl,
                    state: status,
                } as AwsConnection)
            }
        })
        return connections
    }

    async useConnection(connectionId: string): Promise<AuthError | undefined> {
        return this.ssoSetup('useConnection', async () => {
            const conn = await Auth.instance.getConnection({ id: connectionId })
            if (conn === undefined || conn.type !== 'sso') {
                return
            }
            if (this.isCodeCatalystLogin) {
                if (conn.scopes?.includes(scopesCodeCatalyst[0])) {
                    getLogger().info(`auth: re-use connection from existing connection id ${connectionId}`)
                    await this.codeCatalystAuth.secondaryAuth.useNewConnection(conn)
                } else {
                    getLogger().info(
                        `auth: re-use(new scope) to connection from existing connection id ${connectionId}`
                    )
                    await this.codeCatalystAuth.secondaryAuth.addScopes(conn, scopesCodeCatalyst)
                }
            } else {
                await Auth.instance.useConnection({ id: connectionId })
            }
        })
    }

    findConnection(connections: AwsConnection[]): AwsConnection | undefined {
        return undefined
    }

    async quitLoginScreen() {
        await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
    }
}
