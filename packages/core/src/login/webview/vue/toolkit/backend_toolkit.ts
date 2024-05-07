/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { tryAddCredentials } from '../../../../auth/utils'
import { getLogger } from '../../../../shared/logger'
import { CommonAuthWebview } from '../backend'
import {
    AwsConnection,
    Connection,
    createSsoProfile,
    hasScopes,
    isIdcSsoConnection,
    scopesSsoAccountAccess,
} from '../../../../auth/connection'
import { Auth } from '../../../../auth/auth'
import { CodeCatalystAuthenticationProvider } from '../../../../codecatalyst/auth'
import { AuthError, AuthFlowState, TelemetryMetadata } from '../types'
import { addScopes } from '../../../../auth/secondaryAuth'

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
            return this.ssoSetup('startCodeCatalystSSOSetup', async () => {
                this.storeMetricMetadata({ ...metadata })

                const conn = await this.codeCatalystAuth.connectToEnterpriseSso(startUrl, region)

                this.storeMetricMetadata({ authEnabledFeatures: this.getAuthEnabledFeatures(conn) })

                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
                await this.showResourceExplorer()
            })
        }

        return this.ssoSetup('createIdentityCenterConnection', async () => {
            this.storeMetricMetadata({ ...metadata })

            const ssoProfile = createSsoProfile(startUrl, region)
            const conn = await Auth.instance.createConnection(ssoProfile)
            await Auth.instance.useConnection(conn)

            this.storeMetricMetadata({ authEnabledFeatures: this.getAuthEnabledFeatures(conn) })

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
        this.storeMetricMetadata({
            credentialSourceId: 'sharedCredentials',
            authEnabledFeatures: 'awsExplorer',
            ...this.getResultForMetrics(result),
        })
        this.emitAuthMetric()

        return result
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeCatalystBuilderIdSetup', async () => {
            this.storeMetricMetadata({ credentialSourceId: 'awsId', authEnabledFeatures: 'codecatalyst' })

            await this.codeCatalystAuth.connectToAwsBuilderId()
            await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
            await this.showResourceExplorer()
        })
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
    async useConnection(connectionId: string, auto: boolean): Promise<AuthError | undefined> {
        return this.ssoSetup('useConnection', async () => {
            let conn = await Auth.instance.getConnection({ id: connectionId })
            if (conn === undefined || conn.type !== 'sso') {
                return
            }

            this.storeMetricMetadata(this.getMetadataForExistingConn(conn))

            if (this.isCodeCatalystLogin) {
                await this.codeCatalystAuth.tryUseConnection(conn)
            } else {
                if (isIdcSsoConnection(conn) && !hasScopes(conn, scopesSsoAccountAccess)) {
                    conn = await addScopes(conn, scopesSsoAccountAccess)
                }
                await Auth.instance.useConnection({ id: connectionId })
            }

            this.storeMetricMetadata({ authEnabledFeatures: this.getAuthEnabledFeatures(conn) })

            await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
            await this.showResourceExplorer()
        })
    }

    findUsableConnection(connections: AwsConnection[]): AwsConnection | undefined {
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
