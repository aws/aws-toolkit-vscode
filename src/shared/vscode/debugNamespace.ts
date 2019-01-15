/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from './types'

export interface DebugNamespace {
    activeDebugSession: vscode.DebugSession | undefined

    activeDebugConsole: vscode.DebugConsole

    breakpoints: vscode.Breakpoint[]

    readonly onDidChangeActiveDebugSession: vscode.Event<vscode.DebugSession | undefined>

    readonly onDidStartDebugSession: vscode.Event<vscode.DebugSession>

    readonly onDidReceiveDebugSessionCustomEvent: vscode.Event<vscode.DebugSessionCustomEvent>

    readonly onDidTerminateDebugSession: vscode.Event<vscode.DebugSession>

    readonly onDidChangeBreakpoints: vscode.Event<vscode.BreakpointsChangeEvent>

    registerDebugConfigurationProvider(
        debugType: string,
        provider: vscode.DebugConfigurationProvider
    ): vscode.Disposable

    startDebugging(
        folder: vscode.WorkspaceFolder | undefined,
        nameOrConfiguration: string | vscode.DebugConfiguration
    ): Thenable<boolean>

    addBreakpoints(breakpoints: vscode.Breakpoint[]): void

    removeBreakpoints(breakpoints: vscode.Breakpoint[]): void
}
