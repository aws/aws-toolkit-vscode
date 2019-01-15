/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from './types'

export interface CommandsNamespace {
    registerCommand(
        command: string,
        callback: (...args: any[]) => any,
        thisArg?: any
    ): vscode.Disposable

    registerTextEditorCommand(
        command: string,
        callback: (
            textEditor: vscode.TextEditor,
            edit: vscode.TextEditorEdit,
            ...args: any[]
        ) => void,
        thisArg?: any
    ): vscode.Disposable

    executeCommand<T>(
        command: string,
        ...rest: any[]
    ): Thenable<T | undefined>

    getCommands(
        filterInternal?: boolean
    ): Thenable<string[]>
}
