/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from './auth'
import { LoginManager } from './deprecated/loginManager'
import { fromString } from './providers/credentials'
import { getLogger } from '../shared/logger/logger'
import { ExtensionUse, initializeCredentialsProviderManager } from './utils'
import { isAmazonQ, isCloud9, isSageMaker } from '../shared/extensionUtilities'
import { isInDevEnv } from '../shared/vscode/env'
import { isWeb } from '../shared/extensionGlobals'

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

    await showManageConnectionsOnStartup()
}

/**
 * Show the Manage Connections page when the extension starts up, if it should be shown.
 */
async function showManageConnectionsOnStartup() {
    // Do not show connection management to user in certain scenarios.
    let reason: string = ''
    if (isWeb()) {
        // TODO: Figure out how we want users to connect to auth in browser mode
        reason = 'We are in the browser'
    } else if (!ExtensionUse.instance.isFirstUse()) {
        reason = 'This is not the users first use of the extension'
    } else if (isInDevEnv()) {
        reason = 'The user is in a Dev Evironment'
    } else if (isCloud9('any')) {
        reason = 'The user is in Cloud9'
    }
    if (reason) {
        getLogger().debug(`firstStartup: ${reason}. Skipped showing Add Connections page.`)
        return
    }
}
