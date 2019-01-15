/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { DebugNamespace } from '..'

export class DefaultDebugNamespace implements DebugNamespace {
    public get activeDebugSession(): vscode.DebugSession | undefined {
        return vscode.debug.activeDebugSession
    }
    public set activeDebugSession(value: vscode.DebugSession | undefined) {
        vscode.debug.activeDebugSession = value
    }

    public get activeDebugConsole(): vscode.DebugConsole {
        return vscode.debug.activeDebugConsole
    }
    public set activeDebugConsole(value: vscode.DebugConsole) {
        vscode.debug.activeDebugConsole = value
    }

    public get breakpoints(): vscode.Breakpoint[] {
        return vscode.debug.breakpoints
    }
    public set breakpoints(value: vscode.Breakpoint[]) {
        vscode.debug.breakpoints = value
    }

    public get onDidChangeActiveDebugSession(): vscode.Event<vscode.DebugSession | undefined> {
        return vscode.debug.onDidChangeActiveDebugSession
    }

    public get onDidStartDebugSession(): vscode.Event<vscode.DebugSession> {
        return vscode.debug.onDidStartDebugSession
    }

    public get onDidReceiveDebugSessionCustomEvent(): vscode.Event<vscode.DebugSessionCustomEvent> {
        return vscode.debug.onDidReceiveDebugSessionCustomEvent
    }

    public get onDidTerminateDebugSession(): vscode.Event<vscode.DebugSession> {
        return vscode.debug.onDidTerminateDebugSession
    }

    public get onDidChangeBreakpoints(): vscode.Event<vscode.BreakpointsChangeEvent> {
        return vscode.debug.onDidChangeBreakpoints
    }

    public registerDebugConfigurationProvider(
        debugType: string,
        provider: vscode.DebugConfigurationProvider
    ): vscode.Disposable {
        return vscode.debug.registerDebugConfigurationProvider(debugType, provider)
    }

    public startDebugging(
        folder: vscode.WorkspaceFolder | undefined,
        nameOrConfiguration: string | vscode.DebugConfiguration
    ): Thenable<boolean> {
        return vscode.debug.startDebugging(folder, nameOrConfiguration)
    }

    public addBreakpoints(breakpoints: vscode.Breakpoint[]): void {
        vscode.debug.addBreakpoints(breakpoints)
    }

    public removeBreakpoints(breakpoints: vscode.Breakpoint[]): void {
        vscode.debug.removeBreakpoints(breakpoints)
    }
}
