/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import type { Lambda } from 'aws-sdk'
import { getLogger } from '../../shared/logger/logger'

const logger = getLogger()

export const remoteDebugSnapshotString = 'aws.lambda.remoteDebugSnapshot'

export interface DebugConfig {
    functionArn: string
    functionName: string
    port: number | undefined
    localRoot: string
    remoteRoot: string
    skipFiles: string[]
    shouldPublishVersion: boolean
    lambdaRuntime?: string // Lambda runtime (e.g., nodejs18.x)
    debuggerRuntime?: string // VS Code debugger runtime (e.g., node)
    outFiles?: string[]
    sourceMap?: boolean
    justMyCode?: boolean
    projectName?: string
    otherDebugParams?: string
    lambdaTimeout?: number
    layerArn?: string
    handlerFile?: string
    samFunctionLogicalId?: string // SAM function logical ID for auto-detecting outFiles
    samProjectRoot?: vscode.Uri // SAM project root for auto-detecting outFiles
    isLambdaRemote: boolean // false if LocalStack connection
}

/**
 * Interface for debugging AWS Lambda functions remotely.
 *
 * This interface defines the contract for implementing remote debugging
 * for Lambda functions.
 *
 * Implementations of this interface handle the lifecycle of remote debugging sessions,
 * including checking health, set up, necessary deployment, and later clean up
 */
export interface LambdaDebugger {
    checkHealth(): Promise<void>
    setup(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        functionConfig: Lambda.FunctionConfiguration,
        region: string
    ): Promise<void>
    waitForSetup(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        functionConfig: Lambda.FunctionConfiguration,
        region: string
    ): Promise<void>
    waitForFunctionUpdates(progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void>
    cleanup(functionConfig: Lambda.FunctionConfiguration): Promise<void>
}

// this should be called when the debug session is started
export async function persistLambdaSnapshot(config: Lambda.FunctionConfiguration | undefined): Promise<void> {
    try {
        await globals.globalState.update(remoteDebugSnapshotString, config)
    } catch (error) {
        // TODO raise toolkit error
        logger.error(`Error persisting debug sessions: ${error}`)
    }
}

export function getLambdaSnapshot(): Lambda.FunctionConfiguration | undefined {
    return globals.globalState.get<Lambda.FunctionConfiguration>(remoteDebugSnapshotString)
}
