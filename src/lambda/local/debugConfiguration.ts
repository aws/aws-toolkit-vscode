/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export interface DebugConfiguration extends vscode.DebugConfiguration {
    readonly type: 'node' | 'python'
    readonly request: 'attach' | 'launch'
    readonly name: string
    readonly port: number
}

export interface NodejsDebugConfiguration extends DebugConfiguration {
    readonly type: 'node'
    readonly preLaunchTask?: string
    readonly address: 'localhost'
    readonly localRoot: string
    readonly remoteRoot: '/var/task'
    readonly skipFiles?: string[]
}

export interface PythonPathMapping {
    localRoot: string
    remoteRoot: string
}

export interface PythonDebugConfiguration extends DebugConfiguration {
    type: 'python'
    host: string
    pathMappings: PythonPathMapping[]
}
