/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { tryAddCredentials } from '../../../auth/utils'
import { getLogger } from '../../../shared/logger'
import { AuthError, CommonAuthWebview } from './backend'
import { SsoConnection, createSsoProfile } from '../../../auth/connection'
import { Auth } from '../../../auth/auth'

export class ToolkitLoginWebview extends CommonAuthWebview {
    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        return this.ssoSetup('createIdentityCenterConnection', async () => {
            const ssoProfile = createSsoProfile(startUrl, region)
            const conn = await Auth.instance.createConnection(ssoProfile)
            await Auth.instance.useConnection(conn)
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
            await this.showResourceExplorer()
            return
        } catch (e) {
            getLogger().error('Failed submitting credentials', e)
            return { id: this.id, text: e as string }
        }
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeCatalystBuilderIdSetup', async () => {
            // no builder id in toolkit
        })
    }

    async errorNotification(e: AuthError) {
        await vscode.window.showInformationMessage(`${e.text}`)
    }

    fetchConnection(): SsoConnection | undefined {
        //TODO":
        return undefined
    }
}
