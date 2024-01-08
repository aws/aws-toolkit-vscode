/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger'
import { showViewLogsMessage } from '../shared/utilities/messages'

/**
 * Show the connection message in output channel. Log the error message if connection fails.
 * @param warehouseIdentifier
 * @param error
 */
export function showConnectionMessage(warehouseIdentifier: string, error: Error | undefined) {
    const outputChannel = globals.outputChannel
    outputChannel.show(true)
    const outputMessage = createLogsConnectionMessage(warehouseIdentifier, error)
    outputChannel.appendLine(outputMessage)
}

/**
 * Create the connection message and log the error if the connection fails.
 * @param warehouseIdentifier
 * @param error
 * @returns the connection message to show
 */
export function createLogsConnectionMessage(warehouseIdentifier: string, error: Error | undefined): string {
    let connectionMessage = ''
    if (!error) {
        connectionMessage = `Redshift: connected to: ${warehouseIdentifier}`
    } else {
        connectionMessage = `Redshift: failed to connect to: ${warehouseIdentifier}: ${(error as Error).message}`
        getLogger().error(connectionMessage)
    }
    return connectionMessage
}

/**
 * Log the fetching error message and show a window with "View Logs" button
 * @param fetchType
 * @param identifier
 * @param error
 */
export function showViewLogsFetchMessage(fetchType: string, identifier: string, error: Error) {
    const message = `Redshift: failed to fetch ${fetchType} for ${identifier}: ${(error as Error).message}`
    getLogger().error(message)
    void showViewLogsMessage(message)
}
