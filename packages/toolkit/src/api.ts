/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Auth, Connection } from 'aws-core-vscode/auth'

export interface AwsConnection {
    readonly id: string
    readonly label: string
    readonly type: string
    readonly ssoRegion: string
    readonly startUrl: string
    readonly scopes?: string[]
}

/**
 * Exposing listConnections API for other extension to read or re-use
 * the available connections in aws toolkit.
 */
export const awsToolkitApi = {
    async listConnections(): Promise<AwsConnection[]> {
        const connections = await Auth.instance.listConnections()
        const exposedConnections: AwsConnection[] = []
        connections.forEach((x: Connection) => {
            if ('ssoRegion' in x) {
                exposedConnections.push({
                    id: x.id,
                    label: x.label,
                    type: x.type,
                    ssoRegion: x.ssoRegion,
                    startUrl: x.startUrl,
                    scopes: x.scopes,
                })
            }
        })
        return exposedConnections
    },
}
