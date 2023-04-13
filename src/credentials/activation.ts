/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { Settings } from '../shared/settings'
import { Auth } from './auth'
import { LoginManager } from './loginManager'
import { fromString } from './providers/credentials'
import { AuthCommandDeclarations } from './commands'

export async function initialize(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    settings: Settings,
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
    // for: '"command": "aws.auth.showConnectionsPage"' in package.json
    const authCommands = new AuthCommandDeclarations(extensionContext)
    authCommands.registerCommandsWithVSCode()
}
