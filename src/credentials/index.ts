/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from './auth'
import { fromString } from './providers/credentials'
import { AuthCommandBackend, AuthCommandDeclarations } from './commands'
import { registerCommandsWithVSCode } from '../shared/vscode/commands2'
import globals from '../shared/extensionGlobals'

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    Auth.instance.onDidChangeActiveConnection(conn => {
        // This logic needs to be moved to `Auth.useConnection` to correctly record `passive`
        if (conn?.type === 'iam' && conn.state === 'valid') {
            globals.loginManager.login({ passive: true, providerId: fromString(conn.id) })
        } else {
            globals.loginManager.logout()
        }
    })

    // TODO: To enable this in prod we need to remove the 'when' clause
    // for: '"command": "aws.auth.showConnectionsPage"' in package.json
    registerCommandsWithVSCode(ctx, new AuthCommandDeclarations(), new AuthCommandBackend(ctx))
}
