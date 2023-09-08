/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { Auth } from './auth'
import { LoginManager } from './deprecated/loginManager'
import { fromString } from './providers/credentials'
import { registerCommandsWithVSCode } from '../shared/vscode/commands2'
import { AuthCommandBackend, AuthCommandDeclarations } from './commands'
import { getLogger } from '../shared/logger'
import { isInDevEnv } from '../codecatalyst/utils'
import { ExtensionUse } from './utils'

export async function initialize(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    loginManager: LoginManager
): Promise<void> {
    Auth.instance.onDidChangeActiveConnection(conn => {
        // This logic needs to be moved to `Auth.useConnection` to correctly record `passive`
        if (conn?.type === 'iam' && conn.state === 'valid') {
            loginManager.login({ passive: true, providerId: fromString(conn.id) })
        } else {
            loginManager.logout()
        }
    })

    registerCommandsWithVSCode(
        extensionContext,
        AuthCommandDeclarations.instance,
        new AuthCommandBackend(extensionContext)
    )

    showManageConnectionsOnStartup()
}

/**
 * Show the Manage Connections page when the extension starts up, if it should be shown.
 */
async function showManageConnectionsOnStartup() {
    if (!ExtensionUse.instance.isFirstUse()) {
        getLogger().debug(
            'firstStartup: This is not the users first use of the extension, skipping showing Add Connections page.'
        )
        return
    }

    if (isInDevEnv()) {
        getLogger().debug('firstStartup: Detected we are in Dev Env, skipping showing Add Connections page.')
        return
    }

    AuthCommandDeclarations.instance.declared.showConnectionsPage.execute('firstStartup')
}
