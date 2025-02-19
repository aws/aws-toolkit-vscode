/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from './auth'
import { LoginManager } from './deprecated/loginManager'
import { fromString } from './providers/credentials'
import { initializeCredentialsProviderManager } from './utils'
import { isAmazonQ, isSageMaker } from '../shared/extensionUtilities'

interface SagemakerCookie {
    authMode?: 'Sso' | 'Iam'
}

export async function initialize(loginManager: LoginManager): Promise<void> {
    if (isAmazonQ() && isSageMaker()) {
        // The command `sagemaker.parseCookies` is registered in VS Code Sagemaker environment.
        const result = (await vscode.commands.executeCommand('sagemaker.parseCookies')) as SagemakerCookie
        if (result.authMode !== 'Sso') {
            initializeCredentialsProviderManager()
        }
    }
    Auth.instance.onDidChangeActiveConnection(async (conn) => {
        // This logic needs to be moved to `Auth.useConnection` to correctly record `passive`
        if (conn?.type === 'iam' && conn.state === 'valid') {
            await loginManager.login({ passive: true, providerId: fromString(conn.id) })
        } else {
            await loginManager.logout()
        }
    })
}
