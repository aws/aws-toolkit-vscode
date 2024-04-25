/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { tryAddCredentials } from '../../../../auth/utils'
import { getLogger } from '../../../../shared/logger'
import { AuthError, CommonAuthWebview, TelemetryMetadata } from '../backend'
import { AwsConnection, Connection, createSsoProfile } from '../../../../auth/connection'
import { Auth } from '../../../../auth/auth'
import { CodeCatalystAuthenticationProvider } from '../../../../codecatalyst/auth'
import { AuthFlowState } from '../types'

export class ToolkitLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.toolkit.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/toolkit/index.js'
    private isCodeCatalystLogin = false

    override onActiveConnectionModified: vscode.EventEmitter<void> = new vscode.EventEmitter()

    constructor(private readonly codeCatalystAuth: CodeCatalystAuthenticationProvider) {
        super(ToolkitLoginWebview.sourcePath)
    }

    setLoginService(serviceToShow?: string) {
        this.isCodeCatalystLogin = serviceToShow === 'codecatalyst'
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        const metadata: TelemetryMetadata = {
            credentialSourceId: 'iamIdentityCenter',
            credentialStartUrl: startUrl,
            region,
        }
        if (this.isCodeCatalystLogin) {
            return this.ssoSetup(
                'startCodeCatalystSSOSetup',
                { ...metadata, authEnabledFeatures: 'codecatalyst' },
                async () => {
                    await this.codeCatalystAuth.connectToEnterpriseSso(startUrl, region)
                    await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                    await this.showResourceExplorer()
                }
            )
        }

        return this.ssoSetup(
            'createIdentityCenterConnection',
            { ...metadata, authEnabledFeatures: 'awsExplorer' },
            async () => {
                const ssoProfile = createSsoProfile(startUrl, region)
                const conn = await Auth.instance.createConnection(ssoProfile)
                await Auth.instance.useConnection(conn)
                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                void vscode.window.showInformationMessage('Toolkit: Successfully connected to AWS IAM Identity Center')
                void this.showResourceExplorer()
            }
        )
    }

    async startIamCredentialSetup(
        profileName: string,
        accessKey: string,
        secretKey: string
    ): Promise<AuthError | undefined> {
        // See submitData() in manageCredentials.vue
        const runAuth = async () => {
            const data = { aws_access_key_id: accessKey, aws_secret_access_key: secretKey }
            const error = await this.getAuthenticatedCredentialsError(data)
            if (error) {
                return { id: this.id, text: error.error }
            }
            try {
                await tryAddCredentials(profileName, data, true)
                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                await this.showResourceExplorer()
            } catch (e) {
                getLogger().error('Failed submitting credentials', e)
                return { id: this.id, text: e as string }
            }
        }

        const result = await runAuth()
        this.emitAuthMetric({
            credentialSourceId: 'sharedCredentials',
            authEnabledFeatures: 'awsExplorer',
            ...this.getResultForMetrics(result),
        })

        return result
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup(
            'startCodeCatalystBuilderIdSetup',
            { credentialSourceId: 'awsId', authEnabledFeatures: 'codecatalyst' },
            async () => {
                await this.codeCatalystAuth.connectToAwsBuilderId()
                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                await this.showResourceExplorer()
            }
        )
    }

    async errorNotification(e: AuthError) {
        await vscode.window.showInformationMessage(`${e.text}`)
    }
    /**
     * Returns list of connections that are pushed from Amazon Q to Toolkit
     */
    async fetchConnections(): Promise<AwsConnection[] | undefined> {
        const connections: AwsConnection[] = []
        const _connections = await Auth.instance.listConnections()
        _connections.forEach(c => {
            const status = Auth.instance.getConnectionState({ id: c.id })
            const source = Auth.instance.getConnectionSource({ id: c.id })
            if (c.type === 'sso' && source === 'amazonq' && status) {
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
    /**
     * Re-use connection that is pushed from Amazon Q to Toolkit.
     */
    async useConnection(connectionId: string): Promise<AuthError | undefined> {
        return this.ssoSetup(
            'useConnection',
            undefined, // todo: provide telemetry
            async () => {
                const conn = await Auth.instance.getConnection({ id: connectionId })
                if (conn === undefined || conn.type !== 'sso') {
                    return
                }
                if (this.isCodeCatalystLogin) {
                    await this.codeCatalystAuth.tryUseConnection(conn)
                } else {
                    await Auth.instance.useConnection({ id: connectionId })
                }
                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                await this.showResourceExplorer()
            }
        )
    }

    findConnection(connections: AwsConnection[]): AwsConnection | undefined {
        return undefined
    }

    override reauthenticateConnection(): Promise<undefined> {
        throw new Error('Method not implemented.')
    }
    override getActiveConnection(): Promise<Connection | undefined> {
        throw new Error('Method not implemented.')
    }

    override async refreshAuthState(): Promise<void> {}
    override async getAuthState(): Promise<AuthFlowState> {
        // No need for a reauth page yet, so always show login
        return 'LOGIN'
    }

    override signout(): Promise<void> {
        throw new Error('Method not implemented.')
    }

    override getReauthError(): Promise<AuthError | undefined> {
        throw new Error('Method not implemented.')
    }

    async quitLoginScreen() {
        await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
    }
}
