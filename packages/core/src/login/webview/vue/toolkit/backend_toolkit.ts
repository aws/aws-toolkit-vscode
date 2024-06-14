/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { tryAddCredentials } from '../../../../auth/utils'
import { getLogger } from '../../../../shared/logger'
import { CommonAuthWebview } from '../backend'
import { AwsConnection, Connection, createSsoProfile } from '../../../../auth/connection'
import { Auth } from '../../../../auth/auth'
import { CodeCatalystAuthenticationProvider } from '../../../../codecatalyst/auth'
import { AuthError, AuthFlowState, TelemetryMetadata } from '../types'
import { builderIdStartUrl } from '../../../../auth/sso/model'

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
        getLogger().debug(`called startEnterpriseSetup() with startUrl: '${startUrl}', region: '${region}'`)
        const metadata: TelemetryMetadata = {
            credentialSourceId: 'iamIdentityCenter',
            credentialStartUrl: startUrl,
            awsRegion: region,
            isReAuth: false,
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
        getLogger().debug(`called startIamCredentialSetup()`)
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
        getLogger().debug(`called startBuilderIdSetup()`)
        return this.ssoSetup('startCodeCatalystBuilderIdSetup', async () => {
            this.storeMetricMetadata({
                credentialSourceId: 'awsId',
                authEnabledFeatures: 'codecatalyst',
                isReAuth: false,
            })

            await this.codeCatalystAuth.connectToAwsBuilderId()
            await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', false)
            await this.showResourceExplorer()
        })
    }

    /**
     * Returns list of connections that are pushed from other extensions to Toolkit
     */
    async fetchConnections(): Promise<AwsConnection[] | undefined> {
        const connections: AwsConnection[] = []
        Auth.instance.declaredConnections.forEach(conn => {
            // No need to display Builder ID as an existing connection,
            // users can just select the Builder ID login option and it would have the same effect.
            if (conn.startUrl !== builderIdStartUrl) {
                connections.push({
                    ssoRegion: conn.ssoRegion,
                    startUrl: conn.startUrl,
                } as AwsConnection)
            }
        })
        return connections
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
        await this.showResourceExplorer()
    }
}
