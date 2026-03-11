/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { promises as fs } from 'fs' // eslint-disable-line no-restricted-imports
import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { clearSSHHostKey } from './hyperpodUtils'
import { getHyperpodConnection } from './detached-server/hyperpodMappingUtils'

export class HyperpodReconnectionManager {
    private static instance: HyperpodReconnectionManager
    private timers = new Map<string, NodeJS.Timeout>()

    static getInstance(): HyperpodReconnectionManager {
        if (!HyperpodReconnectionManager.instance) {
            HyperpodReconnectionManager.instance = new HyperpodReconnectionManager()
        }
        return HyperpodReconnectionManager.instance
    }

    scheduleReconnection(connectionKey: string, intervalMinutes: number = 12): void {
        this.clearReconnection(connectionKey)

        const timer = setInterval(
            () => {
                this.refreshCredentials(connectionKey).catch((error) => {
                    getLogger().error(`Credential refresh failed for ${connectionKey}: ${error}`)
                    if (error.message?.includes('Connection mapping not found')) {
                        this.clearReconnection(connectionKey)
                    }
                })
            },
            intervalMinutes * 60 * 1000
        )

        this.timers.set(connectionKey, timer)
    }

    clearReconnection(connectionKey: string): void {
        const timer = this.timers.get(connectionKey)
        if (timer) {
            clearInterval(timer)
            this.timers.delete(connectionKey)
        }
    }

    async refreshCredentials(connectionKey: string): Promise<void> {
        try {
            const connectionMapping = await getHyperpodConnection(connectionKey)
            await clearSSHHostKey(connectionKey, connectionMapping?.region, connectionMapping?.accountId)

            const serverInfoPath = vscode.Uri.joinPath(
                globals.context.globalStorageUri,
                'sagemaker-local-server-info.json'
            ).fsPath

            const serverInfoContent = await fs.readFile(serverInfoPath, 'utf8')
            const serverInfo = JSON.parse(serverInfoContent)

            const keyParts = connectionKey.split(':')
            if (keyParts.length !== 3) {
                getLogger().warn(
                    `Using legacy connection key format: ${connectionKey}. This may cause issues with multiple namespaces.`
                )
            }

            const port = parseInt(serverInfo.port, 10)
            if (isNaN(port) || port < 1 || port > 65535) {
                throw new Error('Invalid port number in server info')
            }

            const apiUrl = `http://localhost:${port}/get_hyperpod_session?connection_key=${encodeURIComponent(connectionKey)}`
            const response = await fetch(apiUrl)

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Connection mapping not found for ${connectionKey}. Please reconnect manually.`)
                }
                throw new Error(`API call failed: ${response.status} - ${response.statusText}`)
            }

            const data = await response.json()
            if (data.status !== 'success') {
                throw new Error(data.message || 'Unknown API error')
            }
        } catch (error) {
            getLogger().error(`Failed to refresh credentials for ${connectionKey}: ${error}`)
            throw error
        }
    }
}
