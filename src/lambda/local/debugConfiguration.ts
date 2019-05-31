/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as os from 'os'
import * as vscode from 'vscode'
import { DRIVE_LETTER_REGEX } from '../../shared/codelens/codeLensUtils'

const DOTNET_CORE_DEBUGGER_PATH = '/tmp/lambci_debug_files/vsdbg'

export interface DebugConfiguration extends vscode.DebugConfiguration {
    readonly type: 'node' | 'python' | 'coreclr'
    readonly request: 'attach'
}

export interface NodejsDebugConfiguration extends DebugConfiguration {
    readonly type: 'node'
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

export interface PythonPathMapping {
    localRoot: string
    remoteRoot: string
}

export interface PythonDebugConfiguration extends DebugConfiguration {
    readonly type: 'python'
    readonly host: string
    readonly port: number
    readonly pathMappings: PythonPathMapping[]
}

export interface DotNetCoreDebugConfiguration extends DebugConfiguration {
    type: 'coreclr'
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

export interface MakeCoreCLRDebugConfigurationArguments {
    port: number
    codeUri: string
}

export function makeCoreCLRDebugConfiguration({
    codeUri,
    port
}: MakeCoreCLRDebugConfigurationArguments): DotNetCoreDebugConfiguration {
    const pipeArgs = ['-c', `docker exec -i $(docker ps -q -f publish=${port}) \${debuggerCommand}`]

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(DRIVE_LETTER_REGEX, match => match.toUpperCase())
    }

    return {
        name: 'SamLocalDebug',
        type: 'coreclr',
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
        }
    }
}
