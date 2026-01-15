/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess } from '../../shared/utilities/processUtils'
import { getLogger } from '../../shared/logger/logger'
import { HyperpodReconnectionManager } from './hyperpodReconnection'
import { getHyperpodConnection } from './detached-server/hyperpodMappingUtils'

interface ConnectionState {
    connectionKey: string
    lastHealthCheck: number
    reconnectAttempts: number
}

export class HyperpodConnectionMonitor {
    private static instance: HyperpodConnectionMonitor
    private connections = new Map<string, ConnectionState>()
    private healthCheckInterval?: NodeJS.Timeout

    static getInstance(): HyperpodConnectionMonitor {
        if (!HyperpodConnectionMonitor.instance) {
            HyperpodConnectionMonitor.instance = new HyperpodConnectionMonitor()
        }
        return HyperpodConnectionMonitor.instance
    }

    startMonitoring(connectionKey: string): void {
        const keyParts = connectionKey.split(':')
        if (keyParts.length !== 3) {
            getLogger().warn(
                `Connection key ${connectionKey} does not follow expected format (cluster:namespace:devspace). Monitoring may be unreliable.`
            )
        }

        this.connections.set(connectionKey, {
            connectionKey,
            lastHealthCheck: Date.now(),
            reconnectAttempts: 0,
        })

        if (!this.healthCheckInterval) {
            this.healthCheckInterval = setInterval(() => {
                void this.performHealthChecks()
            }, 30000)
        }
    }

    stopMonitoring(connectionKey: string): void {
        this.connections.delete(connectionKey)

        if (this.connections.size === 0 && this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
            this.healthCheckInterval = undefined
        }
    }

    private async performHealthChecks(): Promise<void> {
        for (const [connectionKey, state] of this.connections) {
            try {
                const hasActiveProcesses = await this.checkActiveProcesses(connectionKey)
                if (hasActiveProcesses) {
                    state.lastHealthCheck = Date.now()
                    state.reconnectAttempts = 0
                } else {
                    await this.handleDisconnection(connectionKey, state)
                }
            } catch (error) {
                await this.handleDisconnection(connectionKey, state)
            }
        }
    }

    private async checkActiveProcesses(connectionKey: string): Promise<boolean> {
        try {
            const keyParts = connectionKey.split(':')
            const connectionMapping = await getHyperpodConnection(connectionKey)

            let hostPattern: string
            if (keyParts.length === 3 && connectionMapping?.region && connectionMapping?.accountId) {
                // New format: hp_<cluster_name>_<namespace>_<space_name>_<region>_<account_id>
                hostPattern = `hp_${keyParts[0]}_${keyParts[1]}_${keyParts[2]}_${connectionMapping.region}_${connectionMapping.accountId}`
            } else {
                hostPattern = `hp_${connectionKey.replace(/:/g, '_')}`
            }

            const sshCheck = new ChildProcess('pgrep', ['-f', `ssh.*${hostPattern}`])
            const ssmCheck = new ChildProcess('pgrep', ['-f', 'session-manager-plugin'])

            const [sshResult, ssmResult] = await Promise.allSettled([sshCheck.run(), ssmCheck.run()])

            const hasSsh = sshResult.status === 'fulfilled' && sshResult.value.exitCode === 0
            const hasSSM = ssmResult.status === 'fulfilled' && ssmResult.value.exitCode === 0

            return hasSsh || hasSSM
        } catch {
            return false
        }
    }

    private async handleDisconnection(connectionKey: string, state: ConnectionState): Promise<void> {
        if (state.reconnectAttempts >= 3) {
            getLogger().error(`Max reconnection attempts reached for ${connectionKey}. Stopping monitoring.`)
            this.stopMonitoring(connectionKey)
            return
        }

        state.reconnectAttempts++
        getLogger().warn(
            `Connection lost for ${connectionKey}, refreshing credentials (attempt ${state.reconnectAttempts})`
        )

        try {
            await HyperpodReconnectionManager.getInstance().refreshCredentials(connectionKey)
            state.reconnectAttempts = 0
            state.lastHealthCheck = Date.now()
        } catch (error) {
            getLogger().error(`Failed to refresh credentials for ${connectionKey}: ${error}`)

            if (error instanceof Error && error.message?.includes('Connection mapping not found')) {
                getLogger().error(`Connection mapping missing for ${connectionKey}. Stopping monitoring.`)
                this.stopMonitoring(connectionKey)
            }
        }
    }

    dispose(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
        }
        this.connections.clear()
    }
}
