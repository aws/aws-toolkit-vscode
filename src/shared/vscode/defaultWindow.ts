/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Window } from './window'

export class DefaultWindow implements Window {
    private readonly defaultStatusBarTimeout = 2000

    public setStatusBarMessage(
        message: string,
        hideAfterTimeout: number = this.defaultStatusBarTimeout
    ): vscode.Disposable {
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
