/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Dialog, InputBox, Message, Progress, StatusBar, Window } from './window'

export class DefaultWindow implements Window {
    public readonly statusBar = new DefaultStatusBar()
    public readonly inputBox = new DefaultInputBox()
    public readonly message = new DefaultMessage()
    public readonly progress = new DefaultProgress()
    public readonly dialog = new DefaultDialog()
}

export class DefaultStatusBar implements StatusBar {
    private readonly defaultTimeout = 2000

    public setMessage(message: string, hideAfterTimeout: number = this.defaultTimeout): vscode.Disposable {
        return vscode.window.setStatusBarMessage(message, hideAfterTimeout)
    }
}

export class DefaultInputBox implements InputBox {
    public show(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken): Thenable<string | undefined> {
        return vscode.window.showInputBox(options, token)
    }
}

export class DefaultMessage implements Message {
    public showError(message: string, ...items: string[]): Thenable<string | undefined> {
        return vscode.window.showErrorMessage(message, ...items)
    }
}

export class DefaultProgress implements Progress {
    public show<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R> {
        return vscode.window.withProgress(options, task)
    }
}

export class DefaultDialog implements Dialog {
    public showOpen(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
        return vscode.window.showOpenDialog(options)
    }

    public showSave(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
        return vscode.window.showSaveDialog(options)
    }
}
