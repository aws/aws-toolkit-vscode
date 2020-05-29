/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isThenable } from '../../../shared/utilities/promiseUtilities'
import { Window } from '../../../shared/vscode/window'

export interface FakeWindowOptions {
    statusBar?: StatusBarOptions
    inputBox?: InputBoxOptions
    message?: MessageOptions
    progress?: ProgressOptions
    dialog?: DialogOptions
}

export class FakeWindow implements Window {
    private readonly _statusBar: DefaultFakeStatusBar
    private readonly _inputBox: DefaultFakeInputBox
    private readonly _message: DefaultFakeMessage
    private readonly _progress: DefaultFakeProgress
    private readonly _dialog: DefaultFakeDialog

    public get statusBar(): FakeStatusBar {
        return this._statusBar
    }

    public get inputBox(): FakeInputBox {
        return this._inputBox
    }

    public get message(): FakeMessage {
        return this._message
    }

    public get progress(): FakeProgress {
        return this._progress
    }

    public get dialog(): FakeDialog {
        return this._dialog
    }

    public setStatusBarMessage(message: string, hideAfterTimeout: number): vscode.Disposable {
        return this._statusBar.setMessage(message)
    }

    public showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined> {
        return this._inputBox.show(options)
    }

    public showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        return this._message.showInformation(message)
    }

    public showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        return this._message.showWarning(message)
    }

    public showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
        return this._message.showError(message)
    }

    public withProgress<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R> {
        return this._progress.show(options, task)
    }

    public showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
        return this._dialog.showOpen(options)
    }

    public showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
        return this._dialog.showSave(options)
    }

    public constructor({ statusBar, inputBox, message, progress, dialog }: FakeWindowOptions = {}) {
        this._statusBar = new DefaultFakeStatusBar(statusBar)
        this._inputBox = new DefaultFakeInputBox(inputBox)
        this._message = new DefaultFakeMessage(message)
        this._progress = new DefaultFakeProgress(progress)
        this._dialog = new DefaultFakeDialog(dialog)
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StatusBarOptions {}

export interface FakeStatusBar {
    /**
     * The message that was set, if any.
     */
    readonly message: string | undefined
}

class DefaultFakeStatusBar implements FakeStatusBar {
    public message: string | undefined

    /**
     * Records the message that was set.
     *
     * @returns a no-op Disposable
     */
    public setMessage(message: string): vscode.Disposable {
        this.message = message
        return new vscode.Disposable(() => undefined)
    }

    public constructor({}: StatusBarOptions = {}) {}
}

export interface InputBoxOptions {
    /**
     * The input to respond with, if any.
     */
    input?: string | undefined
}

export interface FakeInputBox {
    /**
     * The options shown, if any.
     */
    readonly options: vscode.InputBoxOptions | undefined

    /**
     * The message returned from the validateInput function, if any.
     */
    readonly errorMessage: string | undefined
}

class DefaultFakeInputBox implements FakeInputBox {
    private readonly input: string | undefined

    public errorMessage: string | undefined
    public options: vscode.InputBoxOptions | undefined

    /**
     * Passes the {@link input} to the {@link vscode.InputBoxOptions.validateInput} and records the {@link errorMessage}, if any.
     * If validation fails, acts as though the user cancelled after the failure (by returning an empty Promise).
     *
     * @returns a Promise of the {@link input} if validation succeeds or no validation was set,
     * otherwise returns an empty Promise.
     */
    public async show(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        this.options = options
        if (this.input !== undefined && options?.validateInput) {
            const result = options.validateInput(this.input)
            if (isThenable<string | undefined>(result)) {
                this.errorMessage = await result
            } else {
                this.errorMessage = result as string | undefined
            }

            if (this.errorMessage) {
                return Promise.resolve(undefined)
            }
        }

        return Promise.resolve(this.input)
    }

    public constructor({ input }: InputBoxOptions = {}) {
        this.input = input
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MessageOptions {}

export interface FakeMessage {
    /**
     * The information message that was shown, if any.
     */
    readonly information: string | undefined

    /**
     * The warning message that was shown, if any.
     */
    readonly warning: string | undefined

    /**
     * The error message that was shown, if any.
     */
    readonly error: string | undefined
}

class DefaultFakeMessage implements FakeMessage {
    public information: string | undefined
    public warning: string | undefined
    public error: string | undefined

    /**
     * Records the information message that was shown, if any.
     *
     * @returns an empty Promise.
     */
    public async showInformation(message: string): Promise<string | undefined> {
        this.information = message
        return Promise.resolve(undefined)
    }

    /**
     * Records the warning message that was shown, if any.
     *
     * @returns an empty Promise.
     */
    public async showWarning(message: string): Promise<string | undefined> {
        this.warning = message
        return Promise.resolve(undefined)
    }

    /**
     * Records the error message that was shown, if any.
     *
     * @returns an empty Promise.
     */
    public async showError(message: string): Promise<string | undefined> {
        this.error = message
        return Promise.resolve(undefined)
    }

    public constructor({}: MessageOptions = {}) {}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ProgressOptions {}

export interface FakeProgress {
    /**
     * The progress that was reported, if any.
     */
    readonly reported: { message?: string; increment?: number }[]

    /**
     * The options that were shown, if any.
     */
    readonly options: vscode.ProgressOptions | undefined
}

class DefaultFakeProgress implements FakeProgress {
    public reported: { message?: string; increment?: number }[] = []
    public options: vscode.ProgressOptions | undefined

    /**
     * Records the options and progress that were reported, if any.
     *
     * @returns the output of the task.
     */
    public async show<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Promise<R> {
        this.options = options

        const reporter: vscode.Progress<{ message?: string; increment?: number }> = {
            report: item => {
                this.reported.push(item)
            },
        }

        const token: vscode.CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: new vscode.EventEmitter().event,
        }

        return task(reporter, token)
    }

    public constructor({}: ProgressOptions = {}) {}
}

export interface DialogOptions {
    /**
     * The file to select in the open dialog, if any.
     */
    openSelections?: vscode.Uri[] | undefined

    /**
     * The file to select in the save dialog, if any.
     */
    saveSelection?: vscode.Uri | undefined
}

export interface FakeDialog {
    /**
     * The open options that were shown, if any.
     */
    readonly openOptions: vscode.OpenDialogOptions | undefined

    /**
     * The save options that were shown, if any.
     */
    readonly saveOptions: vscode.SaveDialogOptions | undefined
}

class DefaultFakeDialog implements FakeDialog {
    private readonly openSelections: vscode.Uri[] | undefined
    private readonly saveSelection: vscode.Uri | undefined

    public openOptions: vscode.OpenDialogOptions | undefined
    public saveOptions: vscode.SaveDialogOptions | undefined

    /**
     * Selects the file(s) specified in the {@link openSelections}, if any.
     *
     * @returns a Promise of the {@link openSelections}.
     */
    public async showOpen(options: vscode.OpenDialogOptions): Promise<vscode.Uri[] | undefined> {
        this.openOptions = options
        return Promise.resolve(this.openSelections)
    }

    /**
     * Selects the file specified in the {@link saveSelection}, if any.
     *
     * @returns a Promise of the {@link saveSelection}.
     */
    public async showSave(options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined> {
        this.saveOptions = options
        return Promise.resolve(this.saveSelection)
    }

    public constructor({ openSelections, saveSelection }: DialogOptions = {}) {
        this.openSelections = openSelections
        this.saveSelection = saveSelection
    }
}
