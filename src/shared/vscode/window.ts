/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Components associated with {@link module:vscode.window}.
 */
export interface Window {
    /**
     * See {@link module:vscode.window.setStatusBarMessage}.
     */
    setStatusBarMessage(message: string, hideAfterTimeout: number): vscode.Disposable

    /**
     * See {@link module:vscode.window.showInputBox}.
     */
    showInputBox(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken): Thenable<string | undefined>

    /**
     * See {@link module:vscode.window.showInformationMessage}.
     */
    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>

    /**
     * See {@link module:vscode.window.showWarningMessage}.
     */
    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>

    /**
     * See {@link module:vscode.window.showErrorMessage}.
     */
    showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>

    /**
     * See {@link module:vscode.window.withProgress}.
     */
    withProgress<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R>

    /**
     * See {@link module:vscode.window.showOpenDialog}.
     */
    showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>

    /**
     * See {@link module:vscode.window.showSaveDialog}.
     */
    showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined>
}

export namespace Window {
    export function vscode(): Window {
        return new DefaultWindow()
    }
}

class DefaultWindow implements Window {
    public setStatusBarMessage(message: string, hideAfterTimeout: number): vscode.Disposable {
        return vscode.window.setStatusBarMessage(message, hideAfterTimeout)
    }

    public showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined> {
        return vscode.window.showInputBox(options, token)
    }

    public showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        return vscode.window.showInformationMessage(message, ...items)
    }

    public showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        return vscode.window.showWarningMessage(message, ...items)
    }

    public showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        return vscode.window.showErrorMessage(message, ...items)
    }

    public withProgress<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R> {
        return vscode.window.withProgress(options, task)
    }

    public showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
        return vscode.window.showOpenDialog(options)
    }

    public showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
        return vscode.window.showSaveDialog(options)
    }
}
