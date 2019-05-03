/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export interface DebugConfiguration extends vscode.DebugConfiguration {
    readonly type: 'node' | 'python'
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
