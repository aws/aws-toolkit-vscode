/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { AuthStatus } from 'aws-core-vscode/telemetry'
import { AwsConnection, Connection, SsoConnection, AuthUtils } from 'aws-core-vscode/auth'
import { activateExtension, getLogger } from 'aws-core-vscode/shared'
import { VSCODE_EXTENSION_ID } from 'aws-core-vscode/utils'

/** Provides the status of the Auth connection for Amazon Q, specifically for telemetry purposes. */
export async function getAuthStatus() {
    // Get auth state from the Amazon Q extension
    const authState = (await AuthUtil.instance.getChatAuthState()).codewhispererChat
    let authEnabledConnections = AuthUtils.getAuthFormIdsFromConnection(AuthUtil.instance.conn)
    let authStatus: AuthStatus = authState === 'connected' || authState === 'expired' ? authState : 'notConnected'
    let authScopes: string[] = (AuthUtil.instance.conn as SsoConnection)?.scopes ?? []

    // If the Q extension does not have its own connection, it will fallback and check
    // if the Toolkit extension can provide a connection that works with Q
    if (authStatus === 'notConnected') {
        let autoConnectConn: AwsConnection | undefined = undefined
        try {
            autoConnectConn = await getAutoConnectableConnection()
        } catch (e) {
            getLogger().error(`Failed ${getAutoConnectableConnection.name}:\n\n%s`, JSON.stringify(e))
        }

        // Determine the status of the Toolkit connection we will autoconnect to
        if (autoConnectConn) {
            authStatus = autoConnectConn.state === 'valid' ? 'connected' : 'expired'

            // Though TS won't say it, AwsConnection sufficiently overlaps with Connection for the purposes
            // of `getAuthFormIdsFromConnection`
            authEnabledConnections = AuthUtils.getAuthFormIdsFromConnection(autoConnectConn as unknown as Connection)
            authScopes = autoConnectConn.scopes ?? []
        }
    }

    return { authStatus, authEnabledConnections: authEnabledConnections.join(','), authScopes: authScopes.join(',') }
}

/**
 * Returns a connection from the standalone Toolkit extension that
 * the Amazon Q extension can use. Otherwise it returns undefined.
 *
 * HACK: Our frontend Login ui for Amazon Q will auto connect if required/possible,
 * but we cannot detect this at the end of Amazon Q extension activation.
 * So we reuse the same {@link findUsableQConnection}()
 * and assume that the frontend will have the same result and auto connect.
 */
async function getAutoConnectableConnection(): Promise<AwsConnection | undefined> {
    const extension = await activateExtension<any>(VSCODE_EXTENSION_ID.awstoolkit)
    if (!extension) {
        return undefined
    }
    const importedApis = extension.exports.getApi(VSCODE_EXTENSION_ID.awstoolkit)

    const listConnections: () => Promise<AwsConnection[]> = importedApis?.listConnections
    if (!listConnections) {
        // Either the user has an older toolkit version w/o the API, or the API has changed
        // and this needs to be updated.
        return undefined
    }

    return AuthUtil.instance.findUsableQConnection(await listConnections())
}
