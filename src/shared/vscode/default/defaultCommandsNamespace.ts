/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { CommandsNamespace } from '..'

export class DefaultCommandsNamespace implements CommandsNamespace {
    public registerCommand(
        command: string,
        callback: (...args: any[]) => any,
        thisArg?: any
    ): vscode.Disposable {
        return vscode.commands.registerCommand(command, callback, thisArg)
    }

    public registerTextEditorCommand(
        command: string,
        callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void,
        thisArg?: any
    ): vscode.Disposable {
        return vscode.commands.registerTextEditorCommand(command, callback, thisArg)
    }

    public executeCommand<T>(
        command: string,
        ...rest: any[]
    ): Thenable<T | undefined> {
        return vscode.commands.executeCommand(command, ...rest)
    }

    public getCommands(
        filterInternal?: boolean
    ): Thenable<string[]> {
        return vscode.commands.getCommands(filterInternal)
    }
}
