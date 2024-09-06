/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Type for arguments needed to update a progress window
 * {@link vscode.window.withProgress}
 */
export interface ProgressEntry {
    message?: string
    increment?: number
}

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
    showInformationMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>
    showInformationMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>
    showInformationMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>

    /**
     * See {@link module:vscode.window.showWarningMessage}.
     */
    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>
    showWarningMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>
    showWarningMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>
    showWarningMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>

    /**
     * See {@link module:vscode.window.showErrorMessage}.
     */
    showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>
    showErrorMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string | undefined>
    showErrorMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>
    showErrorMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>

    /**
     * See {@link module:vscode.window.withProgress}.
     */
    withProgress<R>(
        options: vscode.ProgressOptions,
        task: (progress: vscode.Progress<ProgressEntry>, token: vscode.CancellationToken) => Thenable<R>
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
