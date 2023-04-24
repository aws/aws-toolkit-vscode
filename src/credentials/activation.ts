/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { Auth } from './auth'
import { LoginManager } from './loginManager'
import { fromString } from './providers/credentials'
import { AuthCommandBackend, AuthCommandDeclarations } from './commands'
import { Commands, registerCommandsWithVSCode } from '../shared/vscode/commands2'
import { settings } from './sso/cache'
import { isCloud9 } from '../shared/extensionUtilities'

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

    // Skip showing a notification on C9 because settings may behave differently
    if (!isCloud9()) {
        extensionContext.subscriptions.push(registerCacheDirSettingListener())
    }

    // TODO: To enable this in prod we need to remove the 'when' clause
    // for: '"command": "aws.auth.showConnectionsPage"' in package.json
    registerCommandsWithVSCode(
        extensionContext,
        new AuthCommandDeclarations(),
        new AuthCommandBackend(extensionContext)
    )
}

// Future work: update `Auth` so a reload isn't needed
// Having a notfication is still nice though because it provides immediate feedback
function registerCacheDirSettingListener() {
    return settings.onDidChange(async ({ key }) => {
        if (key === 'ssoCacheDirectory') {
            const resp = await vscode.window.showInformationMessage(
                'SSO cache directory changed. A reload is required for this to take effect.',
                'Reload'
            )
            if (resp === 'Reload') {
                const reloadCommand = await Commands.get('workbench.action.reloadWindow')
                await reloadCommand?.execute()
            }
        }
    })
}
