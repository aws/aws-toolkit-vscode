/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { SsoConnection } from '../../../auth/connection'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { AuthError, CommonAuthWebview } from './backend'
import { awsIdSignIn } from '../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../codewhisperer/util/getStartUrl'

export class AmazonQLoginWebview extends CommonAuthWebview {
    fetchConnection(): SsoConnection | undefined {
        if (AuthUtil.instance.isConnected() && AuthUtil.instance.conn?.type === 'sso') {
            return AuthUtil.instance.conn
        }
        return undefined
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererBuilderIdSetup', async () => {
            await awsIdSignIn()
            AuthUtil.instance.hasAlreadySeenMigrationAuthScreen = true
            await vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS Builder ID')
        })
    }

    startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            await connectToEnterpriseSso(startUrl, region)
            AuthUtil.instance.hasAlreadySeenMigrationAuthScreen = true
            void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS IAM Identity Center')
        })
    }

    async errorNotification(e: AuthError) {
        await vscode.window.showInformationMessage(`${e.text}`)
    }

    override startIamCredentialSetup(
        profileName: string,
        accessKey: string,
        secretKey: string
    ): Promise<AuthError | undefined> {
        throw new Error('Method not implemented.')
    }
}
