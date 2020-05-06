/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Components associated with {@link vscode.window}.
 */
export interface Window {
    statusBar: StatusBar
    inputBox: InputBox
    message: Message
    progress: Progress
    dialog: Dialog
}

/**
 * Actions associated with status bars in {@link vscode.window}.
 */
export interface StatusBar {
    /**
     * See {@link vscode.window.setStatusBarMessage}.
     */
    setMessage(message: string, hideAfterTimeout?: number): vscode.Disposable
}

/**
 * Actions associated with input boxes in {@link vscode.window}.
 */
export interface InputBox {
    /**
     * See {@link vscode.window.showInputBox}.
     */
    show(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken): Thenable<string | undefined>
}

/**
 * Actions associated with showing messages in {@link vscode.window}.
 */
export interface Message {
    /**
     * See {@link vscode.window.showErrorMessage}.
     */
    showError(message: string, ...items: string[]): Thenable<string | undefined>
}

/**
 * Actions associated with showing progress in {@link vscode.window}.
 */
export interface Progress {
    /**
     * See {@link vscode.window.withProgress}.
     */
    show<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R>
}

/**
 * Actions associated with showing dialog boxes in {@link vscode.window}.
 */
export interface Dialog {
    /**
     * See {@link vscode.window.showOpenDialog}.
     */
    showOpen(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>

    /**
     * See {@link vscode.window.showSaveDialog}.
     */
    showSave(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined>
}

export * from './defaultWindow'
