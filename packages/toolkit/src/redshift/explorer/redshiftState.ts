/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConnectionParams } from '../models/models'
import globals from '../../shared/extensionGlobals'

const redshiftConnectionsGlobalStateKey = 'aws.redshift.connections'

// Used to set global state so the connection wizard is not triggered during explorer node refresh after connection deletion
export const deleteConnection = 'DELETE_CONNECTION'

/**
 * Update the connectionParams of a specified redshiftWarehouse in the global state
 * @param {string} redshiftWarehouseArn - the redshift warehouse ARN
 * @param {ConnectionParams | undefined | string} connectionParams - the input connectionParams to store. The value is a string when
 *                                                                   the connection is deleted but the explorer node is not refreshed yet
 */
export async function updateConnectionParamsState(
    redshiftWarehouseArn: string,
    connectionParams: ConnectionParams | undefined | string
) {
    const redshiftConnections = globals.context.globalState.get<Record<string, ConnectionParams | string>>(
        redshiftConnectionsGlobalStateKey,
        {}
    )
    await globals.context.globalState.update(redshiftConnectionsGlobalStateKey, {
        ...redshiftConnections,
        [redshiftWarehouseArn]: connectionParams,
    })
}

/**
 * Get the connectionParams of a specified redshiftWarehouse from the global state
 * @param {string} redshiftWarehouseArn - the redshift warehouse ARN
 * @returns {ConnectionParams | undefined | string} the stored connectionParams state. The value is a string when the connection
 *                                                  is deleted but the explorer node is not refreshed yet.
 */
export function getConnectionParamsState(redshiftWarehouseArn: string): ConnectionParams | undefined | string {
    return globals.context.globalState.get<Record<string, ConnectionParams | string>>(
        redshiftConnectionsGlobalStateKey,
        {}
    )[redshiftWarehouseArn]
}
