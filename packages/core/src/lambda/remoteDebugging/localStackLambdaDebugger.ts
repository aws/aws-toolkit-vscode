/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import type { Lambda } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'
import { persistLambdaSnapshot, type LambdaDebugger, type DebugConfig } from './lambdaDebugger'
import { getLambdaClientWithAgent, getLambdaDebugUserAgent } from './utils'
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'

export class LocalStackLambdaDebugger implements LambdaDebugger {
    private debugConfig: DebugConfig

    constructor(debugConfig: DebugConfig) {
        this.debugConfig = debugConfig
    }

    public async checkHealth(): Promise<void> {
        const endpointUrl = globals.awsContext.getCredentialEndpointUrl()
        const localStackHealthUrl = `${endpointUrl}/_localstack/health`
        const localStackNotRunningMessage = 'LocalStack is not reachable. Ensure LocalStack is running!'
        try {
            const response = await fetch(localStackHealthUrl)
            if (!response.ok) {
                getLogger().error(`LocalStack health check failed with status ${response.status}`)
                throw new ToolkitError(localStackNotRunningMessage)
            }
        } catch (error) {
            throw ToolkitError.chain(error, localStackNotRunningMessage)
        }
    }

    public async setup(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        functionConfig: Lambda.FunctionConfiguration,
        region: string
    ): Promise<void> {
        // No function update and version publishing needed for LocalStack
        this.debugConfig.shouldPublishVersion = false

        progress.report({ message: 'Creating LocalStack debug configuration...' })
        const endpointUrl = globals.awsContext.getCredentialEndpointUrl()
        const localStackLDMUrl = `${endpointUrl}/_aws/lambda/debug_configs/${functionConfig.FunctionArn}:$LATEST`
        const response = await fetch(localStackLDMUrl, {
            method: 'PUT',
            body: JSON.stringify({
                port: this.debugConfig.port,
                user_agent: getLambdaDebugUserAgent(),
            }),
        })

        if (!response.ok) {
            const error = await this.errorFromResponse(response)
            if (error.startsWith('UnsupportedLocalStackVersion')) {
                void vscode.window.showErrorMessage(`${error}`, 'Update LocalStack Docker image').then((selection) => {
                    if (selection) {
                        const terminal = vscode.window.createTerminal('Update LocalStack Docker image')
                        terminal.show()
                        terminal.sendText('localstack update docker-images')
                    }
                })
            } else {
                void vscode.window.showErrorMessage(error)
            }

            throw ToolkitError.chain(
                error,
                `Failed to create LocalStack debug configuration for Lambda function ${functionConfig.FunctionName}.`
            )
        }

        const json = await response.json()
        this.debugConfig.port = json.port
    }

    private async errorFromResponse(response: Response): Promise<string> {
        const isXml = response.headers.get('content-type') === 'application/xml'
        if (isXml) {
            return 'UnsupportedLocalStackVersion: Your current LocalStack version does not support Lambda remote debugging. Update LocalStack and check your license.'
        }

        const isJson = response.headers.get('content-type') === 'application/json'
        if (isJson) {
            const json = await response.json()
            if (json.error.type !== undefined && json.error.message !== undefined) {
                return `${json.error.type}: ${json.error.message}`
            }
        }

        return 'Unknown error'
    }

    public async waitForSetup(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        functionConfig: Lambda.FunctionConfiguration,
        region: string
    ): Promise<void> {
        if (!functionConfig?.FunctionArn) {
            throw new ToolkitError('Could not retrieve Lambda function configuration')
        }

        progress.report({ message: 'Waiting for Lambda function to become Active...' })
        getLogger().info(`Waiting for ${functionConfig.FunctionArn} to become Active...`)
        try {
            await getLambdaClientWithAgent(region).waitForActive(functionConfig.FunctionArn)
        } catch (error) {
            throw ToolkitError.chain(error, 'Lambda function failed to become Active.')
        }

        progress.report({ message: 'Waiting for startup of execution environment and debugger...' })
        getLogger().info(`Waiting for ${functionConfig.FunctionArn} to startup execution environment and debugger...`)
        const endpointUrl = globals.awsContext.getCredentialEndpointUrl()
        const localStackLDMUrl = `${endpointUrl}/_aws/lambda/debug_configs/${functionConfig.FunctionArn}:$LATEST?debug_server_ready_timeout=300`
        // Blocking call to wait for the Lambda function debug server to be running. LocalStack probes the debug server.
        const response = await fetch(localStackLDMUrl, { method: 'GET' })
        if (!response.ok) {
            const error = await this.errorFromResponse(response)
            throw ToolkitError.chain(
                new Error(error),
                `Failed to startup execution environment or debugger for Lambda function ${functionConfig.FunctionName}.`
            )
        }

        const json = await response.json()
        if (json.is_debug_server_running !== true) {
            throw new ToolkitError(
                `Debug server on port ${this.debugConfig.port} is not running for Lambda function ${functionConfig.FunctionName}.`
            )
        }

        getLogger().info(`${functionConfig.FunctionArn} is ready for debugging on port ${this.debugConfig.port}.`)
    }

    public async waitForFunctionUpdates(
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        // No additional steps needed for LocalStack:
        // a) Port probing ensures the debug server is ready
        // b) Invokes for debug-enabled await being served until the debugger is connected
    }

    public async cleanup(functionConfig: Lambda.FunctionConfiguration): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.debug.stop')

        const endpointUrl = globals.awsContext.getCredentialEndpointUrl()
        const localStackLDMUrl = `${endpointUrl}/_aws/lambda/debug_configs/${functionConfig.FunctionArn}:$LATEST`
        const response = await fetch(localStackLDMUrl, { method: 'DELETE' })
        if (!response.ok) {
            const error = await this.errorFromResponse(response)
            getLogger().warn(
                `Failed to remove LocalStack debug configuration for ${functionConfig.FunctionArn}. ${error}`
            )
            throw new ToolkitError(
                `Failed to remove LocalStack debug configuration for Lambda function ${functionConfig.FunctionName}.`
            )
        }

        await persistLambdaSnapshot(undefined)
        getLogger().info(`Removed LocalStack debug configuration for ${functionConfig.FunctionArn}`)
    }
}
