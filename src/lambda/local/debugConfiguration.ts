/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as os from 'os'
import * as vscode from 'vscode'

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

export interface PythonDebugConfiguration extends DebugConfiguration {
    readonly type: 'python'
    readonly host: string
    readonly port: number
    readonly pathMappings: [
        {
            localRoot: string
            remoteRoot: string
        }
    ]
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
    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
    pipeCwd: string
}

export function makeCoreCLRDebugConfiguration(
    { codeUri, port }: {
        port: number,
        codeUri: string
    }
): DotNetCoreDebugConfiguration {
    const pipeArgs = [
        '-c',
        `docker exec -i $(docker ps -q -f publish=${port}) \${debuggerCommand}`
    ]
    const debuggerPath = '/tmp/lambci_debug_files/vsdbg'

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(/^\w\:/, match => match.toUpperCase())
    }

    return {
        name: '.NET Core Docker Attach',
        type: 'coreclr',
        request: 'attach',
        processId: '1',
        pipeTransport: {
            pipeProgram: 'sh',
            pipeArgs,
            debuggerPath,
            pipeCwd: codeUri
        },
        windows: {
            pipeTransport: {
                pipeProgram: 'powershell',
                pipeArgs,
                debuggerPath,
                pipeCwd: codeUri
            }
        },
        sourceFileMap: {
            ['/var/task']: codeUri
        }
    }
}
