/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildProcess } from '../../shared/utilities/processUtils'
import { getLogger } from '../../shared/logger/logger'
import { HyperpodReconnectionManager } from './hyperpodReconnection'

interface ConnectionState {
    devspaceName: string
    process?: ChildProcess
    lastHealthCheck: number
    reconnectAttempts: number
}

export class HyperpodConnectionMonitor {
    private static instance: HyperpodConnectionMonitor
    private connections = new Map<string, ConnectionState>()
    private healthCheckInterval?: NodeJS.Timeout
    private disposables: vscode.Disposable[] = []

    static getInstance(): HyperpodConnectionMonitor {
        if (!HyperpodConnectionMonitor.instance) {
            HyperpodConnectionMonitor.instance = new HyperpodConnectionMonitor()
        }
        return HyperpodConnectionMonitor.instance
    }

    startMonitoring(devspaceName: string, process?: ChildProcess): void {
        const state: ConnectionState = {
            devspaceName,
            process,
            lastHealthCheck: Date.now(),
            reconnectAttempts: 0,
        }

        this.connections.set(devspaceName, state)

        if (process) {
            this.monitorProcess(devspaceName, process)
        }

        this.startHealthChecks()
        this.setupEventListeners()

        getLogger().info(`Started comprehensive monitoring for ${devspaceName}`)
    }

    stopMonitoring(devspaceName: string): void {
        const state = this.connections.get(devspaceName)
        if (state?.process) {
            state.process.removeAllListeners()
        }

        this.connections.delete(devspaceName)

        if (this.connections.size === 0) {
            this.cleanup()
        }
    }

    private monitorProcess(devspaceName: string, process: ChildProcess): void {
        process.on('exit', (code, signal) => {
            getLogger().warn(`HyperPod process for ${devspaceName} exited with code ${code}, signal ${signal}`)
            void this.handleDisconnection(devspaceName, 'process_exit')
        })

        process.on('error', (error) => {
            getLogger().error(`HyperPod process error for ${devspaceName}: ${error}`)
            void this.handleDisconnection(devspaceName, 'process_error')
        })

        process.on('disconnect', () => {
            getLogger().warn(`HyperPod process disconnected for ${devspaceName}`)
            void this.handleDisconnection(devspaceName, 'process_disconnect')
        })
    }

    private startHealthChecks(): void {
        if (this.healthCheckInterval) {
            return
        }

        // Aggressive health checks every 10 seconds
        this.healthCheckInterval = setInterval(async () => {
            for (const [devspaceName, state] of this.connections) {
                await this.performHealthCheck(devspaceName, state)
            }
        }, 10000) // Check every 10 seconds for immediate detection
    }

    private async performHealthCheck(devspaceName: string, state: ConnectionState): Promise<void> {
        try {
            // Check if SSH processes are still running
            const sshProcesses = await this.findSSHProcesses()
            const hasActiveSSH = sshProcesses.length > 0

            // Check if session-manager-plugin is running
            const sessionProcesses = await this.findSessionManagerProcesses()
            const hasActiveSession = sessionProcesses.length > 0

            if (!hasActiveSSH && !hasActiveSession) {
                getLogger().warn(`No active SSH/session processes found for ${devspaceName}`)
                void this.handleDisconnection(devspaceName, 'health_check_failed')
                return
            }

            state.lastHealthCheck = Date.now()
            state.reconnectAttempts = 0 // Reset on successful check
        } catch (error) {
            getLogger().error(`Health check failed for ${devspaceName}: ${error}`)
            void this.handleDisconnection(devspaceName, 'health_check_error')
        }
    }

    private async findSSHProcesses(): Promise<string[]> {
        return new Promise((resolve) => {
            // Look for SSH processes connecting to hp_ hosts
            const ps = new ChildProcess('pgrep', ['-f', 'ssh.*hp_'])
            let output = ''

            ps.stdout?.on('data', (data) => {
                output += data.toString()
            })

            ps.on('close', () => {
                const pids = output
                    .trim()
                    .split('\n')
                    .filter((pid) => pid.length > 0)
                resolve(pids)
            })

            ps.on('error', () => resolve([]))
        })
    }

    private async findSessionManagerProcesses(): Promise<string[]> {
        return new Promise((resolve) => {
            const ps = new ChildProcess('pgrep', ['-f', 'session-manager-plugin'])
            let output = ''

            ps.stdout?.on('data', (data) => {
                output += data.toString()
            })

            ps.on('close', () => {
                const pids = output
                    .trim()
                    .split('\n')
                    .filter((pid) => pid.length > 0)
                resolve(pids)
            })

            ps.on('error', () => resolve([]))
        })
    }

    private setupEventListeners(): void {
        if (this.disposables.length > 0) {
            return
        }

        // Monitor window state changes
        this.disposables.push(
            vscode.window.onDidChangeWindowState(async (state) => {
                if (state.focused) {
                    await this.handleWindowFocus()
                }
            })
        )

        // Monitor workspace changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.handleWorkspaceChange()
            })
        )

        // Monitor remote connection changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('remote')) {
                    getLogger().info('Remote configuration changed, checking connections')
                    this.handleWorkspaceChange()
                }
            })
        )

        // Monitor network connectivity
        this.startNetworkMonitoring()
    }

    private startNetworkMonitoring(): void {
        // Check network connectivity every 5 seconds
        const networkCheck = setInterval(async () => {
            try {
                // Simple network check - try to resolve AWS endpoint
                const ping = new ChildProcess('ping', ['-c', '1', '-W', '2000', 'ssmmessages.us-east-2.amazonaws.com'])

                let networkUp = false
                ping.on('close', (code: number) => {
                    networkUp = code === 0
                    if (networkUp) {
                        // Network is back up, check all connections immediately
                        for (const [devspaceName, state] of this.connections) {
                            void this.performHealthCheck(devspaceName, state)
                        }
                    }
                })
            } catch (error) {
                // Ignore network check errors
            }
        }, 5000)

        this.disposables.push({ dispose: () => clearInterval(networkCheck) })
    }

    private async handleWindowFocus(): Promise<void> {
        for (const devspaceName of this.connections.keys()) {
            const state = this.connections.get(devspaceName)!
            await this.performHealthCheck(devspaceName, state)
        }
    }

    private handleWorkspaceChange(): void {
        // Trigger health checks when workspace changes
        for (const [devspaceName, state] of this.connections) {
            void this.performHealthCheck(devspaceName, state)
        }
    }

    private async handleDisconnection(devspaceName: string, reason: string): Promise<void> {
        const state = this.connections.get(devspaceName)
        if (!state) {
            return
        }

        state.reconnectAttempts++
        getLogger().warn(`Connection lost for ${devspaceName} (reason: ${reason}, attempt: ${state.reconnectAttempts})`)

        // Immediately refresh credentials when connection is lost
        try {
            getLogger().info(`Immediately refreshing credentials for ${devspaceName} after connection loss`)
            const manager = HyperpodReconnectionManager.getInstance()
            await manager.reconnectToHyperpod(devspaceName)

            // Reset attempts on successful credential refresh
            state.reconnectAttempts = 0
            getLogger().info(`Fresh credentials ready for ${devspaceName} - connection will use them on next attempt`)
            return
        } catch (error) {
            getLogger().error(`Failed to refresh credentials for ${devspaceName}: ${error}`)
        }

        // Retry with exponential backoff for repeated failures
        if (state.reconnectAttempts > 3) {
            getLogger().error(`Max reconnection attempts reached for ${devspaceName}`)
            return
        }

        const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), 10000)
        getLogger().info(`Retrying credential refresh for ${devspaceName} in ${delay}ms`)

        setTimeout(async () => {
            await this.handleDisconnection(devspaceName, 'retry')
        }, delay)
    }

    private cleanup(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
            this.healthCheckInterval = undefined
        }

        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    dispose(): void {
        this.connections.clear()
        this.cleanup()
    }
}
