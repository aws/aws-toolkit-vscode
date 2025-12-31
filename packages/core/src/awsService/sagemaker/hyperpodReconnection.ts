/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'

export class HyperpodReconnectionManager {
    private static instance: HyperpodReconnectionManager
    private reconnectionTimers = new Map<string, NodeJS.Timeout>()

    static getInstance(): HyperpodReconnectionManager {
        if (!HyperpodReconnectionManager.instance) {
            HyperpodReconnectionManager.instance = new HyperpodReconnectionManager()
        }
        return HyperpodReconnectionManager.instance
    }

    async scheduleReconnection(devspaceName: string, intervalMinutes: number = 15): Promise<void> {
        // Clear existing timer if any
        this.clearReconnection(devspaceName)

        // Proactively refresh credentials BEFORE they expire
        const timer = setInterval(
            async () => {
                try {
                    getLogger().info(`Proactively refreshing credentials for ${devspaceName} before expiry`)
                    await this.refreshCredentialsOnly(devspaceName)
                } catch (error) {
                    getLogger().error(`Failed to refresh credentials for ${devspaceName}: ${error}`)
                }
            },
            intervalMinutes * 60 * 1000
        )

        this.reconnectionTimers.set(devspaceName, timer)
        getLogger().info(`Scheduled proactive credential refresh for ${devspaceName} every ${intervalMinutes} minutes`)
    }

    clearReconnection(devspaceName: string): void {
        const timer = this.reconnectionTimers.get(devspaceName)
        if (timer) {
            clearInterval(timer)
            this.reconnectionTimers.delete(devspaceName)
        }
    }

    private async refreshCredentialsOnly(devspaceName: string): Promise<void> {
        getLogger().info(`Refreshing credentials for ${devspaceName}`)

        try {
            // Read the dynamic port from the server info file
            const serverInfoPath = `${process.env.HOME}/Library/Application Support/Code/User/globalStorage/amazonwebservices.aws-toolkit-vscode/sagemaker-local-server-info.json`
            const serverInfo = JSON.parse(await require('fs').promises.readFile(serverInfoPath, 'utf8'))
            const port = serverInfo.port

            // Call the get_hyperpod_session API with force_refresh=true
            const response = await fetch(`http://localhost:${port}/get_hyperpod_session?devspace_name=${devspaceName}`)

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()

            if (data.status !== 'success') {
                throw new Error(`API returned error: ${data.message}`)
            }

            getLogger().info(`Proactively refreshed credentials for ${devspaceName}`)
        } catch (error) {
            getLogger().error(`Failed to call get_hyperpod_session API: ${error}`)
            throw error
        }
    }

    async reconnectToHyperpod(devspaceName: string): Promise<void> {
        getLogger().info(`Reconnection triggered for ${devspaceName} - refreshing credentials`)
        await this.refreshCredentialsOnly(devspaceName)
    }
}
