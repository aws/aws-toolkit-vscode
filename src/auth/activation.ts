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
import { ExtensionUse } from '../shared/utilities/vsCodeUtils'
import { telemetry } from '../shared/telemetry/telemetry'
import { AuthSource } from './ui/vue/show'
import { isIamConnection } from './connection'
import { getLogger } from '../shared/logger'
import { isInDevEnv } from '../codecatalyst/utils'
import { waitUntil } from '../shared/utilities/timeoutUtils'

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

    if (hasExistingConnections()) {
        // Just in case isFirstUse() is incorrect, but they have connections, they probably aren't new
        getLogger().debug('firstStartup: The user has existing connections, skipping showing Add Connections page.')
        return
    }

    if (isInDevEnv()) {
        // A dev env will have an existing connection so this scenario is redundant. But keeping
        // for reference.
        getLogger().debug('firstStartup: Detected we are in Dev Env, skipping showing Add Connections page.')
        return
    }

    AuthCommandDeclarations.instance.declared.showConnectionsPage.execute('firstStartup')
    emitFirstStartupMetrics()
}

/**
 * Return true if the user has existing connections that
 * the extension has previously known about.
 */
function hasExistingConnections(): boolean {
    /**
     * This specific property/function does not search for user credentials
     * on their local machine, it looks at the current values in its internal store.
     * So if this returns false it simply means the extension is not aware of it yet,
     * but credentials could exist in something like a `credentials` file.
     *
     * If the user has existing credentials on their system, but this returns false,
     * we can assume this extension has not run before since it would
     * have discovered them and added to the extensions internal store, resulting in
     * this returning true.
     */
    return Auth.instance.hasConnections
}

async function emitFirstStartupMetrics() {
    // HACK: Telemetry client may not be initialized yet, wait until it exists
    await waitUntil(async () => telemetry, {
        interval: 500,
        timeout: 30000,
    })

    // Metric that is emitted for ALL new users
    telemetry.auth_addConnection.emit({
        source: 'firstStartup' as AuthSource,
        reason: 'firstStartup',
        result: 'Cancelled',
    })

    // Metrics that are emitted if certain auths created by the user are found by us
    const allConnections = await Auth.instance.listConnections() // implicitly loads user's credentials
    const reason = 'alreadyHadAuth'

    const credentialsConnections = allConnections.filter(isIamConnection)
    if (credentialsConnections.length > 0) {
        telemetry.auth_addConnection.emit({
            source: 'firstStartup' as AuthSource,
            reason,
            credentialSourceId: 'sharedCredentials',
            authConnectionsCount: credentialsConnections.length,
            result: 'Succeeded',
        })
    }
}
