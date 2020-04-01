/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { nodeJsRuntimes } from '../../lambda/models/samLambdaRuntime'
import { SamLaunchRequestArgs } from '../../shared/sam/debugger/samDebugSession'
import { dotNetRuntimes, pythonRuntimes, RuntimeFamily } from '../models/samLambdaRuntime'

export const DOTNET_CORE_DEBUGGER_PATH = '/tmp/lambci_debug_files/vsdbg'

export interface NodejsDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.NodeJS
    readonly preLaunchTask?: string
    readonly address: 'localhost'
    readonly localRoot: string
    readonly remoteRoot: '/var/task'
    readonly skipFiles?: string[]
    readonly port: number
}

export interface PythonPathMapping {
    localRoot: string
    remoteRoot: string
}

export interface PythonDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.Python
    readonly host: string
    // TODO: remove, use `debugPort` instead?
    readonly port: number
    readonly pathMappings: PythonPathMapping[]
    readonly manifestPath: string
}

export interface DotNetCoreDebugConfiguration extends SamLaunchRequestArgs {
    readonly runtimeFamily: RuntimeFamily.DotNetCore
    processId: string
    pipeTransport: PipeTransport
    windows: {
        pipeTransport: PipeTransport
    }
    sourceFileMap: {
        [key: string]: string
    }
}

export interface PipeTransport {
    pipeProgram: 'sh' | 'powershell'
    pipeArgs: string[]
    debuggerPath: typeof DOTNET_CORE_DEBUGGER_PATH
    pipeCwd: string
}

/**
 * Gets a `RuntimeFamily` from a vscode document languageId.
 */
export function getRuntimeFamily(langId: string): string {
    switch (langId) {
        case 'typescript':
        case 'javascript':
            return 'node'
        case 'csharp':
            return 'coreclr'
        case 'python':
            return 'python'
        default:
            return 'unknown'
    }
}

/**
 * Guesses a reasonable default runtime value from a vscode document
 * languageId.
 */
export function getDefaultRuntime(langId: string): string | undefined {
    switch (langId) {
        case 'typescript':
        case 'javascript':
            return nodeJsRuntimes.first()
        case 'csharp':
            return dotNetRuntimes.first()
        case 'python':
            return pythonRuntimes.first()
        default:
            return undefined
    }
}

export function assertTargetKind(config: SamLaunchRequestArgs, expectedTarget: 'code' | 'template'): void {
    if (config.invokeTarget.target !== expectedTarget) {
        throw Error(`SAM debug: invalid config: ${config}`)
    }
}
