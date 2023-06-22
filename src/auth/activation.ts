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
import { dontShow } from '../shared/localizedText'
import { DevSettings, PromptSettings } from '../shared/settings'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { CodeCatalystAuthenticationProvider } from '../codecatalyst/auth'

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

    // TODO: To enable this in prod we need to remove the 'when' clause
    // for: '"command": "aws.auth.manageConnections"' in package.json
    registerCommandsWithVSCode(
        extensionContext,
        AuthCommandDeclarations.instance,
        new AuthCommandBackend(extensionContext)
    )

    if (DevSettings.instance.isDevMode()) {
        showManageConnectionsOnStartup()
    }
}

/**
 * Show the Manage Connections page when the extension starts up.
 *
 * Additionally, we provide an information message with a button for users to not show it
 * again on next startup.
 */
async function showManageConnectionsOnStartup() {
    await waitUntil(() => Promise.resolve(CodeCatalystAuthenticationProvider.instance), {
        interval: 500,
        timeout: 10000,
    })
    const settings = PromptSettings.instance

    if (!(await settings.isPromptEnabled('manageConnections'))) {
        return
    }

    AuthCommandDeclarations.instance.declared.showConnectionsPage.execute()
    vscode.window.showInformationMessage("Don't show Add Connections page on startup?", dontShow).then(selection => {
        if (selection === dontShow) {
            settings.disablePrompt('manageConnections')
        }
    })
}
