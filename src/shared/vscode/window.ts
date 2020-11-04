/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../extensionGlobals'

interface ProgressEntry {
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

    public showInformationMessage(...args: any[]): Thenable<any | undefined> {
        // @ts-ignore
        return vscode.window.showInformationMessage(...args)
    }

    public showWarningMessage(...args: any[]): Thenable<any | undefined> {
        // @ts-ignore
        return vscode.window.showWarningMessage(...args)
    }

    public showErrorMessage(...args: any[]): Thenable<any | undefined> {
        // @ts-ignore
        return vscode.window.showErrorMessage(...args)
    }

    /**
     * Wraps the `vscode.window.withProgress` functionality with functionality that also writes to the output channel.
     * Params match `vscode.window.withProgress` API; documentation follows:
     *
     * Show progress in the editor. Progress is shown while running the given callback and while the promise it returned isn't resolved nor rejected. The location at which progress should show (and other details) is defined via the passed ProgressOptions.
     *
     *  @param task
     *  A callback returning a promise. Progress state can be reported with the provided progress-object.
     *
     *  To report discrete progress, use increment to indicate how much work has been completed. Each call with a increment value will be summed up and reflected as overall progress until 100% is reached (a value of e.g. 10 accounts for 10% of work done). Note that currently only ProgressLocation.Notification is capable of showing discrete progress.
     *
     *  To monitor if the operation has been cancelled by the user, use the provided CancellationToken. Note that currently only ProgressLocation.Notification is supporting to show a cancel button to cancel the long running operation.
     *
     *  @return — The thenable the task-callback returned.
     */
    public withProgress<R>(
        options: vscode.ProgressOptions,
        task: (progress: vscode.Progress<ProgressEntry>, token: vscode.CancellationToken) => Thenable<R>
    ): Thenable<R> {
        if (options.title) {
            ext.outputChannel.appendLine(options.title)
        }

        // hijack the returned task to wrap progress with an output channel adapter
        const newTask: (progress: vscode.Progress<ProgressEntry>, token: vscode.CancellationToken) => Thenable<R> = (
            progress: vscode.Progress<ProgressEntry>,
            token: vscode.CancellationToken
        ) => {
            const newProgress: vscode.Progress<ProgressEntry> = {
                ...progress,
                report: (value: ProgressEntry) => {
                    if (value.message) {
                        ext.outputChannel.appendLine(value.message)
                    }
                    progress.report(value)
                },
            }

            return task(newProgress, token)
        }

        return vscode.window.withProgress(options, newTask)
    }

    public showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
        return vscode.window.showOpenDialog(options)
    }

    public showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
        return vscode.window.showSaveDialog(options)
    }
}
