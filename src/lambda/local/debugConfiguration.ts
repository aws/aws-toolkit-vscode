/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import { DRIVE_LETTER_REGEX } from '../../shared/codelens/codeLensUtils'
import { SamLaunchRequestArgs } from '../../shared/sam/debugger/samDebugSession'
import { RuntimeFamily, dotNetRuntimes, pythonRuntimes } from '../models/samLambdaRuntime'
import { nodeJsRuntimes } from '../../lambda/models/samLambdaRuntime'

const DOTNET_CORE_DEBUGGER_PATH = '/tmp/lambci_debug_files/vsdbg'

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
 * Creates a CLR config composed from the given `config`.
 */
export function makeCoreCLRDebugConfiguration(
        config: SamLaunchRequestArgs, port: number, codeUri: string)
        : DotNetCoreDebugConfiguration {
    const pipeArgs = ['-c', `docker exec -i $(docker ps -q -f publish=${port}) \${debuggerCommand}`]

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(DRIVE_LETTER_REGEX, match => match.toUpperCase())
    }

    return {
        ...config,
        name: 'SamLocalDebug',
        runtimeFamily: RuntimeFamily.DotNetCore,
        request: 'attach',
        processId: '1',
        pipeTransport: {
            pipeProgram: 'sh',
            pipeArgs,
            debuggerPath: DOTNET_CORE_DEBUGGER_PATH,
            pipeCwd: codeUri
        },
        windows: {
            pipeTransport: {
                pipeProgram: 'powershell',
                pipeArgs,
                debuggerPath: DOTNET_CORE_DEBUGGER_PATH,
                pipeCwd: codeUri
            }
        },
        sourceFileMap: {
            ['/var/task']: codeUri
        },
        invokeTarget: {
            target: "code"
        }
    }
}

/**
 * Gets a `RuntimeFamily` from a vscode document languageId.
 */
export function getRuntimeFamily(langId: string): string {
    switch(langId) {
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
    switch(langId) {
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
