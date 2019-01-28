/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export interface NodeDebugConfiguration extends vscode.DebugConfiguration {
    readonly type: 'node'
    readonly request: 'attach' | 'launch'
    readonly name: string
    readonly preLaunchTask?: string
    readonly address: 'localhost'
    readonly port: number
    readonly localRoot: string
    readonly remoteRoot: '/var/task'
    readonly protocol: 'legacy' | 'inspector'
    readonly skipFiles?: string[]
}
