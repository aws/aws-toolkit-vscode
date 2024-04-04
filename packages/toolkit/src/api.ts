/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Auth, Connection, AwsConnection } from 'aws-core-vscode/auth'
import { getLogger } from 'aws-core-vscode/shared'

export const awsToolkitApi = {
    /**
     * Exposing listConnections API for other extension to read or re-use
     * the available connections in aws toolkit.
     */
    async listConnections(extensionId: string): Promise<AwsConnection[]> {
        getLogger().debug(`${extensionId} invokes listConnections`)
        const connections = await Auth.instance.listConnections()
        const exposedConnections: AwsConnection[] = []
        connections.forEach((x: Connection) => {
            if (x.type === 'sso') {
                const connState = Auth.instance.getConnectionState(x)
                if (connState) {
                    exposedConnections.push({
                        id: x.id,
                        label: x.label,
                        type: x.type,
                        ssoRegion: x.ssoRegion,
                        startUrl: x.startUrl,
                        scopes: x.scopes,
                        state: connState,
                    })
                }
            }
        })
        return exposedConnections
    },

    /**
     * Exposing setConnection API for other extension to push its connection state to aws toolkit
     */
    async setConnection(extensionId: string, connection: AwsConnection): Promise<void> {
        getLogger().debug(`${extensionId} sets connection ${connection.id}`)
        await Auth.instance.setConnectionFromApi(connection)
    },

    /**
     * Exposing deleteConnection API for other extension to push connection deletion event to aws toolkit
     */
    async deleteConnection(extensionId: string, id: string): Promise<void> {
        getLogger().debug(`${extensionId} delete connection ${id}`)
        await Auth.instance.deleteConnection({ id })
    },

    /**
     * Exposing onDidChangeConnection API for other extension to know when aws toolkit connection changed
     */
    async onDidChangeConnection(
        extensionId: string,
        onConnectionStateChange: (c: AwsConnection) => Promise<void>,
        onConnectionDeletion: (id: string) => Promise<void>
    ) {
        getLogger().debug(`${extensionId} invokes onDidChangeConnection`)
        Auth.instance.onDidChangeConnectionState(async e => {
            const conn = await Auth.instance.getConnection({ id: e.id })
            if (conn && conn.type === 'sso') {
                await onConnectionStateChange({
                    type: conn.type,
                    ssoRegion: conn.ssoRegion,
                    scopes: conn.scopes,
                    startUrl: conn.startUrl,
                    state: e.state,
                    id: e.id,
                    label: conn.label,
                } as AwsConnection)
            }
        })
        Auth.instance.onDidDeleteConnection(async id => {
            await onConnectionDeletion(id)
        })
    },
}
