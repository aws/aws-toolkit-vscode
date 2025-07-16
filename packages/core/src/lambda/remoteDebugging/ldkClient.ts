/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IoTSecureTunneling, Lambda } from 'aws-sdk'
import { getClientId } from '../../shared/telemetry/util'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { LocalProxy } from './localProxy'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import { getIoTSTClientWithAgent, getLambdaClientWithAgent } from './utils'
import { ToolkitError } from '../../shared/errors'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

export function isTunnelInfo(data: TunnelInfo): data is TunnelInfo {
    return (
        typeof data === 'object' &&
        data !== null &&
        typeof data.tunnelID === 'string' &&
        typeof data.sourceToken === 'string' &&
        typeof data.destinationToken === 'string'
    )
}

interface TunnelInfo {
    tunnelID: string
    sourceToken: string
    destinationToken: string
}

async function callUpdateFunctionConfiguration(
    lambda: DefaultLambdaClient,
    config: Lambda.FunctionConfiguration,
    waitForUpdate: boolean
): Promise<Lambda.FunctionConfiguration> {
    // Update function configuration back to original values
    return await lambda.updateFunctionConfiguration(
        {
            FunctionName: config.FunctionName!,
            Timeout: config.Timeout,
            Layers: config.Layers?.map((layer) => layer.Arn!).filter(Boolean) || [],
            Environment: {
                Variables: config.Environment?.Variables ?? {},
            },
        },
        {
            maxRetries: 5,
            initialDelayMs: 2000,
            backoffMultiplier: 2,
            waitForUpdate: waitForUpdate,
        }
    )
}

export class LdkClient {
    static #instance: LdkClient
    private localProxy: LocalProxy | undefined
    private static instanceCreating = false
    private lambdaClientCache: Map<string, DefaultLambdaClient> = new Map()
    private iotSTClientCache: Map<string, IoTSecureTunneling> = new Map()

    constructor() {}

    public static get instance() {
        if (this.#instance !== undefined) {
            return this.#instance
        }
        if (this.instanceCreating) {
            getLogger().warn(
                localize(
                    'AWS.lambda.ldkClient.multipleInstancesError',
                    'Attempt to create multiple LdkClient instances simultaneously'
                )
            )
        }
        // Set flag to prevent recursive instance creation
        this.instanceCreating = true
        try {
            const self = (this.#instance = new this())
            return self
        } finally {
            this.instanceCreating = false
        }
    }

    /**
     * Get or create a cached Lambda client for the specified region
     */
    private getLambdaClient(region: string): DefaultLambdaClient {
        if (!this.lambdaClientCache.has(region)) {
            this.lambdaClientCache.set(region, getLambdaClientWithAgent(region))
        }
        return this.lambdaClientCache.get(region)!
    }

    private async getIoTSTClient(region: string): Promise<IoTSecureTunneling> {
        if (!this.iotSTClientCache.has(region)) {
            this.iotSTClientCache.set(region, await getIoTSTClientWithAgent(region))
        }
        return this.iotSTClientCache.get(region)!
    }
    /**
     * Clean up all resources held by this client
     * Should be called when the extension is deactivated
     */
    public dispose(): void {
        if (this.localProxy) {
            this.localProxy.stop()
            this.localProxy = undefined
        }
        // Clear the Lambda client cache
        this.iotSTClientCache.clear()
        this.lambdaClientCache.clear()
    }

    // Create or reuse tunnel
    async createOrReuseTunnel(region: string): Promise<TunnelInfo | undefined> {
        try {
            // Get VSCode UUID using getClientId from telemetry.utils.ts
            const vscodeUuid = getClientId(globals.globalState)

            // Create IoTSecureTunneling client
            const iotSecureTunneling = await this.getIoTSTClient(region)

            // Define tunnel identifier
            const tunnelIdentifier = `RemoteDebugging+${vscodeUuid}`
            const timeoutInMinutes = 720
            // List existing tunnels
            const listTunnelsResponse = await iotSecureTunneling.listTunnels({}).promise()

            // Find tunnel with our identifier
            const existingTunnel = listTunnelsResponse.tunnelSummaries?.find(
                (tunnel) => tunnel.description === tunnelIdentifier && tunnel.status?.toLowerCase() === 'open'
            )

            if (existingTunnel && existingTunnel.tunnelId) {
                const timeCreated = existingTunnel?.createdAt ? new Date(existingTunnel.createdAt) : new Date()
                const expiryTime = new Date(timeCreated.getTime() + timeoutInMinutes * 60 * 1000)
                const currentTime = new Date()
                const minutesRemaining = (expiryTime.getTime() - currentTime.getTime()) / (60 * 1000)

                if (minutesRemaining >= 15) {
                    // Rotate access tokens for the existing tunnel
                    const rotateResponse = await this.refreshTunnelTokens(existingTunnel.tunnelId, region)

                    return rotateResponse
                } else {
                    // Close tunnel if less than 15 minutes remaining
                    await iotSecureTunneling
                        .closeTunnel({
                            tunnelId: existingTunnel.tunnelId,
                            delete: false,
                        })
                        .promise()

                    getLogger().info(`Closed tunnel ${existingTunnel.tunnelId} with less than 15 minutes remaining`)
                }
            }

            // Create new tunnel
            const openTunnelResponse = await iotSecureTunneling
                .openTunnel({
                    description: tunnelIdentifier,
                    timeoutConfig: {
                        maxLifetimeTimeoutMinutes: timeoutInMinutes, // 12 hours
                    },
                    destinationConfig: {
                        services: ['WSS'],
                    },
                })
                .promise()

            getLogger().info(`Created new tunnel with ID: ${openTunnelResponse.tunnelId}`)

            return {
                tunnelID: openTunnelResponse.tunnelId || '',
                sourceToken: openTunnelResponse.sourceAccessToken || '',
                destinationToken: openTunnelResponse.destinationAccessToken || '',
            }
        } catch (error) {
            throw ToolkitError.chain(error, 'Error creating/reusing tunnel')
        }
    }

    // Refresh tunnel tokens
    async refreshTunnelTokens(tunnelId: string, region: string): Promise<TunnelInfo | undefined> {
        try {
            const iotSecureTunneling = await this.getIoTSTClient(region)
            const rotateResponse = await iotSecureTunneling
                .rotateTunnelAccessToken({
                    tunnelId: tunnelId,
                    clientMode: 'ALL',
                })
                .promise()

            return {
                tunnelID: tunnelId,
                sourceToken: rotateResponse.sourceAccessToken || '',
                destinationToken: rotateResponse.destinationAccessToken || '',
            }
        } catch (error) {
            throw ToolkitError.chain(error, 'Error refreshing tunnel tokens')
        }
    }

    async getFunctionDetail(functionArn: string): Promise<Lambda.FunctionConfiguration | undefined> {
        try {
            const region = getRegionFromArn(functionArn)
            if (!region) {
                getLogger().error(
                    localize(
                        'AWS.lambda.ldkClient.couldNotDetermineRegion',
                        'Could not determine region from Lambda ARN'
                    )
                )
                return undefined
            }
            const client = this.getLambdaClient(region)
            const configuration = (await client.getFunction(functionArn)).Configuration as Lambda.FunctionConfiguration
            // get function detail
            // return function detail
            return configuration
        } catch (error) {
            getLogger().warn(`Error getting function detail:${error}`)
            return undefined
        }
    }

    // Create debug deployment to given lambda function
    // save a snapshot of the current config to global : aws.lambda.remoteDebugContext
    // we are 1: changing function timeout to 15 minute
    // 2: adding the ldk layer LDK_LAYER_ARN_X86_64 or LDK_LAYER_ARN_ARM64 (ignore if already added, fail if 5 layer already there)
    // 3: adding two param to lambda environment variable
    // {AWS_LAMBDA_EXEC_WRAPPER:/opt/bin/ldk_wrapper, AWS_LDK_DESTINATION_TOKEN: destinationToken }
    async createDebugDeployment(
        config: Lambda.FunctionConfiguration,
        destinationToken: string,
        lambdaTimeout: number,
        shouldPublishVersion: boolean,
        ldkLayerArn: string,
        progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined }>
    ): Promise<string> {
        try {
            if (!config.FunctionArn || !config.FunctionName) {
                throw new Error(localize('AWS.lambda.ldkClient.functionArnMissing', 'Function ARN is missing'))
            }
            const region = getRegionFromArn(config.FunctionArn ?? '')
            if (!region) {
                throw new Error(
                    localize(
                        'AWS.lambda.ldkClient.couldNotDetermineRegion',
                        'Could not determine region from Lambda ARN'
                    )
                )
            }

            // fix out of bound timeout
            if (lambdaTimeout && (lambdaTimeout > 900 || lambdaTimeout <= 0)) {
                lambdaTimeout = 900
            }

            // Inform user about the changes that will be made

            progress.report({ message: localize('AWS.lambda.ldkClient.applyingChanges', 'Applying changes...') })

            // Determine architecture and select appropriate layer

            const layers = config.Layers || []

            // Check if LDK layer is already added
            const ldkLayerExists = layers.some(
                (layer) => layer.Arn?.includes('LDKLayerX86') || layer.Arn?.includes('LDKLayerArm64')
            )

            // Check if we have room to add a layer (max 5)
            if (!ldkLayerExists && layers.length >= 5) {
                throw new Error(
                    localize(
                        'AWS.lambda.ldkClient.cannotAddLdkLayer',
                        'Cannot add LDK layer: Lambda function already has 5 layers'
                    )
                )
            }
            // Create updated layers list
            const updatedLayers = ldkLayerExists
                ? layers.map((layer) => layer.Arn!).filter(Boolean)
                : [...layers.map((layer) => layer.Arn!).filter(Boolean), ldkLayerArn]

            // Create updated environment variables
            const currentEnv = config.Environment?.Variables || {}
            const updatedEnv: { [key: string]: string } = {
                ...currentEnv,
                AWS_LAMBDA_EXEC_WRAPPER: '/opt/bin/ldk_wrapper',
                AWS_LAMBDA_DEBUG_ON_LATEST: shouldPublishVersion ? 'false' : 'true',
                AWS_LDK_DESTINATION_TOKEN: destinationToken,
            }
            if (currentEnv['AWS_LAMBDA_EXEC_WRAPPER']) {
                updatedEnv.ORIGINAL_AWS_LAMBDA_EXEC_WRAPPER = currentEnv['AWS_LAMBDA_EXEC_WRAPPER']
            }

            // Create Lambda client using AWS SDK
            const lambda = this.getLambdaClient(region)

            // Update function configuration
            if (!config.FunctionArn || !config.FunctionName) {
                throw new Error('Function ARN is missing')
            }

            // Create a temporary config for the update
            const updateConfig: Lambda.FunctionConfiguration = {
                FunctionName: config.FunctionName,
                Timeout: lambdaTimeout ?? 900, // 15 minutes
                Layers: updatedLayers.map((arn) => ({ Arn: arn })),
                Environment: {
                    Variables: updatedEnv,
                },
            }

            await callUpdateFunctionConfiguration(lambda, updateConfig, true)

            // publish version
            let version = '$Latest'
            if (shouldPublishVersion) {
                // should somehow return version for debugging
                const versionResp = await lambda.publishVersion(config.FunctionName, { waitForUpdate: true })
                version = versionResp.Version ?? ''
                // remove debug deployment in a non-blocking way
                void Promise.resolve(
                    callUpdateFunctionConfiguration(lambda, config, false).then(() => {
                        progress.report({
                            message: localize(
                                'AWS.lambda.ldkClient.debugDeploymentCompleted',
                                'Debug deployment completed successfully'
                            ),
                        })
                    })
                )
            }
            return version
        } catch (error) {
            getLogger().error(`Error creating debug deployment: ${error}`)
            if (error instanceof Error) {
                throw new ToolkitError(`Failed to create debug deployment: ${error.message}`)
            }
            return 'Failed'
        }
    }

    // Remove debug deployment from the given lambda function
    // use the snapshot we took before create debug deployment
    // we are 1: reverting timeout to it's original snapshot
    // 2: reverting layer status according to it's original snapshot
    // 3: reverting environment back to it's original snapshot
    async removeDebugDeployment(config: Lambda.FunctionConfiguration, check: boolean = true): Promise<boolean> {
        try {
            if (!config.FunctionArn || !config.FunctionName) {
                throw new Error('Function ARN is missing')
            }
            const region = getRegionFromArn(config.FunctionArn ?? '')
            if (!region) {
                throw new Error('Could not determine region from Lambda ARN')
            }

            if (check) {
                const currentConfig = await this.getFunctionDetail(config.FunctionArn)
                if (
                    currentConfig?.Timeout === config?.Timeout &&
                    currentConfig?.Layers?.length === config?.Layers?.length
                ) {
                    // nothing to remove
                    return true
                }
            }

            // Create Lambda client using AWS SDK
            const lambda = this.getLambdaClient(region)

            // Update function configuration back to original values
            await callUpdateFunctionConfiguration(lambda, config, false)

            return true
        } catch (error) {
            // no need to raise, even this failed we want the following to execute
            throw ToolkitError.chain(error, 'Error removing debug deployment')
        }
    }

    async deleteDebugVersion(functionArn: string, qualifier: string) {
        try {
            const region = getRegionFromArn(functionArn)
            if (!region) {
                throw new Error('Could not determine region from Lambda ARN')
            }
            const lambda = this.getLambdaClient(region)
            await lambda.deleteFunction(functionArn, qualifier)
            return true
        } catch (error) {
            getLogger().error('Error deleting debug version: %O', error)
            return false
        }
    }

    // Start proxy with better resource management
    async startProxy(region: string, sourceToken: string, port: number = 0): Promise<boolean> {
        try {
            getLogger().info(`Starting direct proxy for region:${region}`)

            // Clean up any existing proxy thoroughly
            if (this.localProxy) {
                getLogger().info('Stopping existing proxy before starting a new one')
                this.localProxy.stop()
                this.localProxy = undefined

                // Small delay to ensure resources are released
                await new Promise((resolve) => setTimeout(resolve, 100))
            }

            // Create and start a new local proxy
            this.localProxy = new LocalProxy()

            // Start the proxy and get the assigned port
            const localPort = await this.localProxy.start(region, sourceToken, port)
            getLogger().info(`Local proxy started successfully on port ${localPort}`)
            return true
        } catch (error) {
            getLogger().error(`Failed to start proxy: ${error}`)
            if (this.localProxy) {
                this.localProxy.stop()
                this.localProxy = undefined
            }
            throw ToolkitError.chain(error, 'Failed to start proxy')
        }
    }

    // Stop proxy with proper cleanup and reference handling
    async stopProxy(): Promise<boolean> {
        try {
            getLogger().info(`Stopping proxy`)

            if (this.localProxy) {
                // Ensure proper resource cleanup
                this.localProxy.stop()

                // Force delete the reference to allow GC
                this.localProxy = undefined

                getLogger().info('Local proxy stopped successfully')
            } else {
                getLogger().info('No active local proxy to stop')
            }

            return true
        } catch (error) {
            throw ToolkitError.chain(error, 'Error stopping proxy')
        }
    }
}

// Helper function to extract region from ARN
export function getRegionFromArn(arn: string | undefined): string | undefined {
    if (!arn) {
        return undefined
    }
    const parts = arn.split(':')
    return parts.length >= 4 ? parts[3] : undefined
}
