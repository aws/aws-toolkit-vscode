/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Auth, Connection } from 'aws-core-vscode/auth'
/*!
 * Exposing listConnections API for other extension to read or re-use
 * the available connections in aws toolkit.
 */
export const awsToolkitApi = {
    async listConnections(): Promise<Connection[]> {
        return Auth.instance.listConnections()
    },
}
