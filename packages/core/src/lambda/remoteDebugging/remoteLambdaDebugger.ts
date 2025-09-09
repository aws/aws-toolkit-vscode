/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import type { Lambda } from 'aws-sdk'
import { persistLambdaSnapshot, type LambdaDebugger, type DebugConfig } from './lambdaDebugger'
import { getLogger } from '../../shared/logger/logger'
import { isTunnelInfo, LdkClient } from './ldkClient'
import type { TunnelInfo } from './ldkClient'
import { ToolkitError } from '../../shared/errors'
import { getRemoteDebugLayerForArch } from './ldkLayers'

export function getRemoteDebugLayer(
    region: string | undefined,
    architectures: Lambda.ArchitecturesList | undefined
): string | undefined {
    if (!region || !architectures) {
        return undefined
    }
    if (architectures.includes('x86_64')) {
        return getRemoteDebugLayerForArch(region, 'x86_64')
    }
    if (architectures.includes('arm64')) {
        return getRemoteDebugLayerForArch(region, 'arm64')
    }
    return undefined
}

export interface QualifierProxy {
    setQualifier(qualifier: string): void
    getQualifier(): string | undefined
}

export class RemoteLambdaDebugger implements LambdaDebugger {
    private debugConfig: DebugConfig
    private debugDeployPromise: Promise<string> | undefined
    private tunnelInfo: TunnelInfo | undefined
    private qualifierProxy: QualifierProxy

    constructor(debugConfig: DebugConfig, qualifierProxy: QualifierProxy) {
        this.debugConfig = debugConfig
        this.qualifierProxy = qualifierProxy
    }

    public async checkHealth(): Promise<void> {
        // We assume AWS is always available
    }

    public async setup(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        functionConfig: Lambda.FunctionConfiguration,
        region: string
    ): Promise<void> {
        const ldkClient = LdkClient.instance
        // Create or reuse tunnel
        progress.report({ message: 'Creating secure tunnel...' })
        getLogger().info('Creating secure tunnel...')
        this.tunnelInfo = await ldkClient.createOrReuseTunnel(region)
        if (!this.tunnelInfo) {
            throw new ToolkitError(`Empty tunnel info response, please retry: ${this.tunnelInfo}`)
        }

        if (!isTunnelInfo(this.tunnelInfo)) {
            throw new ToolkitError(`Invalid tunnel info response: ${this.tunnelInfo}`)
        }
        // start update lambda function, await in the end
        // Create debug deployment
        progress.report({ message: 'Configuring Lambda function for debugging...' })
        getLogger().info('Configuring Lambda function for debugging...')

        const layerArn = this.debugConfig.layerArn ?? getRemoteDebugLayer(region, functionConfig.Architectures)
        if (!layerArn) {
            throw new ToolkitError(`No Layer Arn is provided`)
        }
        // start this request and await in the end
        this.debugDeployPromise = ldkClient.createDebugDeployment(
            functionConfig,
            this.tunnelInfo.destinationToken,
            this.debugConfig.lambdaTimeout ?? 900,
            this.debugConfig.shouldPublishVersion,
            layerArn,
            progress
        )
    }

    public async waitForSetup(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        functionConfig: Lambda.FunctionConfiguration,
        region: string
    ): Promise<void> {
        if (!this.tunnelInfo) {
            throw new ToolkitError(`Empty tunnel info response, please retry: ${this.tunnelInfo}`)
        }

        // Start local proxy with timeout and better error handling
        progress.report({ message: 'Starting local proxy...' })

        const proxyStartTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Local proxy start timed out')), 30000)
        })

        const proxyStartAttempt = LdkClient.instance.startProxy(
            region,
            this.tunnelInfo.sourceToken,
            this.debugConfig.port
        )

        const proxyStarted = await Promise.race([proxyStartAttempt, proxyStartTimeout])

        if (!proxyStarted) {
            throw new ToolkitError('Failed to start local proxy')
        }
        getLogger().info('Local proxy started successfully')
    }

    public async waitForFunctionUpdates(
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        // wait until lambda function update is completed
        progress.report({ message: 'Waiting for function update...' })
        const qualifier = await this.debugDeployPromise
        if (!qualifier || qualifier === 'Failed') {
            throw new ToolkitError('Failed to configure Lambda function for debugging')
        }
        // store the published version for debugging in version
        if (this.debugConfig.shouldPublishVersion) {
            // we already reverted
            this.qualifierProxy.setQualifier(qualifier)
        }
    }

    public async cleanup(functionConfig: Lambda.FunctionConfiguration): Promise<void> {
        const ldkClient = LdkClient.instance
        if (!functionConfig?.FunctionArn) {
            throw new ToolkitError('No saved configuration found during cleanup')
        }

        getLogger().info(`Removing debug deployment for function: ${functionConfig.FunctionName}`)

        await vscode.commands.executeCommand('workbench.action.debug.stop')
        // Then stop the proxy (with more reliable error handling)
        getLogger().info('Stopping proxy during cleanup')
        await ldkClient.stopProxy()
        // Ensure our resources are properly cleaned up
        const qualifier = this.qualifierProxy.getQualifier()
        if (qualifier) {
            await ldkClient.deleteDebugVersion(functionConfig?.FunctionArn, qualifier)
        }
        if (await ldkClient.removeDebugDeployment(functionConfig, true)) {
            await persistLambdaSnapshot(undefined)
        }
    }
}
