/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Auth, Connection, AwsConnection } from 'aws-core-vscode/auth'
import { getLogger } from 'aws-core-vscode/shared'

export const awsToolkitApi = {
    /**
     * Creating API object for external extensions.
     * @param extensionId Extension id that identifies the caller.
     */
    getApi(extensionId: string) {
        return {
            /**
             * Exposing listConnections API for other extension to read or re-use
             * the available connections in aws toolkit.
             */
            async listConnections(): Promise<AwsConnection[]> {
                getLogger().debug(`listConnections: extension ${extensionId}`)
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
             * @param connection The AWS connection of the source extension that is intended to be shared with toolkit
             */
            async setConnection(connection: AwsConnection): Promise<void> {
                getLogger().debug(`setConnection: extension ${extensionId}, connection id ${connection.id}`)
                await Auth.instance.setConnectionFromApi(connection)
            },

            /**
             * Exposing deleteConnection API for other extension to push connection deletion event to AWS toolkit
             * @param id The connection id of the to be deleted connection in aws toolkit
             */
            async deleteConnection(id: string): Promise<void> {
                getLogger().debug(`deleteConnection: extension ${extensionId}, connection id ${id}`)
                await Auth.instance.deleteConnection({ id })
            },

            /**
             * Exposing onDidChangeConnection API for other extension to know when aws toolkit connection changed
             * @param onConnectionStateChange The callback that toolkit invokes when toolkit connection state changes
             * @param onConnectionDeletion The callback that toolkit invokes when toolkit connection is deleted.
             */
            async onDidChangeConnection(
                onConnectionStateChange: (c: AwsConnection) => Promise<void>,
                onConnectionDeletion: (id: string) => Promise<void>
            ) {
                getLogger().debug(`onDidChangeConnection: extension ${extensionId}`)
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
    },
}
