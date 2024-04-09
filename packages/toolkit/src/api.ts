/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Auth, Connection, AwsConnection } from 'aws-core-vscode/auth'
import { getLogger, globals } from 'aws-core-vscode/shared'
import { once } from 'aws-core-vscode/shared'
import { randomUUID } from 'crypto'

const _setClientId = once(async (clientId: string) => {
    await globals.context.globalState.update('telemetryClientId', clientId)
})

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
            /**
             * Exposing telemetry client id of aws toolkit.
             * It sets a client if it does not exist.
             * This function does not return client ids for test automation or disabled telemetry clients
             */
            async getTelemetryClientId(): Promise<string | undefined> {
                getLogger().debug(`getTelemetryClientId: extension ${extensionId}`)
                try {
                    let clientId = globals.context.globalState.get<string>('telemetryClientId')
                    if (!clientId) {
                        clientId = randomUUID()
                        await globals.context.globalState.update('telemetryClientId', clientId)
                    }
                    return clientId
                } catch (error) {
                    getLogger().error('Could not create a client id. Reason: %O ', error)
                    return undefined
                }
            },
            /**
             * Exposing set telemetry client id of aws toolkit.
             * Amazon Q should set toolkit client id if Q is activated before toolkit.
             */
            async setTelemetryClientId(clientId: string) {
                getLogger().debug(`setTelemetryClientId: client id ${clientId}, extension ${extensionId}`)
                await _setClientId(clientId)
            },
        }
    },
}
