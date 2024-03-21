/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { tryAddCredentials } from '../../../../auth/utils'
import { getLogger } from '../../../../shared/logger'
import { AuthError, CommonAuthWebview } from '../backend'
import { SsoConnection, createSsoProfile } from '../../../../auth/connection'
import { Auth } from '../../../../auth/auth'
import { CodeCatalystAuthenticationProvider } from '../../../../codecatalyst/auth'

export class ToolkitLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.toolkit.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/toolkit/index.js'

    constructor(private readonly codeCatalystAuth: CodeCatalystAuthenticationProvider) {
        super(ToolkitLoginWebview.sourcePath)
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
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

    async fetchConnections(): Promise<SsoConnection[] | undefined> {
        //This does not need to be implement in aws toolkit vue backend
        return undefined
    }

    async useConnection(connectionId: string): Promise<AuthError | undefined> {
        return undefined
    }
}
