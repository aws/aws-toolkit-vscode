/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isThenable } from '../../../shared/utilities/promiseUtilities'
import { Dialog, InputBox, Message, Progress, StatusBar, Window } from '../../../shared/vscode/window'

export interface FakeWindowOptions {
    statusBar?: FakeStatusBar | FakeStatusBarOptions
    inputBox?: FakeInputBox | FakeInputBoxOptions
    message?: FakeMessage | FakeMessageOptions
    progress?: FakeProgress | FakeProgressOptions
    dialog?: FakeDialog | FakeDialogOptions
}

export class FakeWindow implements Window {
    private readonly _statusBar: FakeStatusBar
    private readonly _inputBox: FakeInputBox
    private readonly _message: FakeMessage
    private readonly _progress: FakeProgress
    private readonly _dialog: FakeDialog

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

    public constructor({
        statusBar = new FakeStatusBar(),
        inputBox = new FakeInputBox(),
        message = new FakeMessage(),
        progress = new FakeProgress(),
        dialog = new FakeDialog(),
    }: FakeWindowOptions = {}) {
        this._statusBar = statusBar instanceof FakeStatusBar ? statusBar : new FakeStatusBar(statusBar)
        this._inputBox = inputBox instanceof FakeInputBox ? inputBox : new FakeInputBox(inputBox)
        this._message = message instanceof FakeMessage ? message : new FakeMessage(message)
        this._progress = progress instanceof FakeProgress ? progress : new FakeProgress(progress)
        this._dialog = dialog instanceof FakeDialog ? dialog : new FakeDialog(dialog)
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FakeStatusBarOptions {}

export class FakeStatusBar implements StatusBar {
    private _message: string | undefined

    /**
     * The message that was set, if any.
     */
    public get message(): string | undefined {
        return this._message
    }

    /**
     * Records the message that was set.
     *
     * @returns a no-op Disposable
     */
    public setMessage(message: string): vscode.Disposable {
        this._message = message
        return new vscode.Disposable(() => undefined)
    }

    public constructor({}: FakeStatusBarOptions = {}) {}
}

export interface FakeInputBoxOptions {
    /**
     * The input to respond with, if any.
     */
    input?: string | undefined
}

export class FakeInputBox implements InputBox {
    private readonly _input: string | undefined
    private _errorMessage: string | undefined
    private _options: vscode.InputBoxOptions | undefined

    /**
     * The options shown, if any.
     */
    public get options(): vscode.InputBoxOptions | undefined {
        return this._options
    }

    /**
     * The message returned from the validateInput function, if any.
     */
    public get errorMessage(): string | undefined {
        return this._errorMessage
    }

    /**
     * Passes the {@link input} to the {@link vscode.InputBoxOptions.validateInput} and records the {@link errorMessage}, if any.
     * If validation fails, acts as though the user cancelled after the failure (by returning an empty Promise).
     *
     * @returns a Promise of the {@link input} if validation succeeds or no validation was set,
     * otherwise returns an empty Promise.
     */
    public async show(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken): Promise<string | undefined> {
        this._options = options
        const validateInput = options?.validateInput

        if (this._input !== undefined && validateInput) {
            const result = validateInput(this._input)
            if (isThenable<string | undefined>(result)) {
                this._errorMessage = await result
            } else {
                this._errorMessage = result as string | undefined
            }

            if (this._errorMessage) {
                return Promise.resolve(undefined)
            }
        }

        return Promise.resolve(this._input)
    }

    public constructor({ input }: FakeInputBoxOptions = {}) {
        this._input = input
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FakeMessageOptions {}

export class FakeMessage implements Message {
    private _error: string | undefined

    /**
     * The error message that was shown, if any.
     */
    public get error(): string | undefined {
        return this._error
    }

    /**
     * Records the error message that was shown, if any.
     *
     * @returns an empty Promise.
     */
    public async showError(message: string, ...items: string[]): Promise<string | undefined> {
        this._error = message
        return Promise.resolve(undefined)
    }

    public constructor({}: FakeMessageOptions = {}) {}
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FakeProgressOptions {}

export class FakeProgress implements Progress {
    private _reported: { message?: string; increment?: number }[] = []
    private _options: vscode.ProgressOptions | undefined

    /**
     * The progress that was reported, if any.
     */
    public get reported(): { message?: string; increment?: number }[] {
        return this._reported
    }

    /**
     * The options that were shown, if any.
     */
    public get options(): vscode.ProgressOptions | undefined {
        return this._options
    }

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
        this._options = options

        const reporter: vscode.Progress<{ message?: string; increment?: number }> = {
            report: item => {
                this._reported.push(item)
            },
        }

        const token: vscode.CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: new vscode.EventEmitter().event,
        }

        return task(reporter, token)
    }

    public constructor({}: FakeProgressOptions = {}) {}
}

export interface FakeDialogOptions {
    /**
     * The file to select in the open dialog, if any.
     */
    openSelections?: vscode.Uri[] | undefined

    /**
     * The file to select in the save dialog, if any.
     */
    saveSelection?: vscode.Uri | undefined
}

export class FakeDialog implements Dialog {
    private readonly _openSelections: vscode.Uri[] | undefined
    private readonly _saveSelection: vscode.Uri | undefined
    private _openOptions: vscode.OpenDialogOptions | undefined
    private _saveOptions: vscode.SaveDialogOptions | undefined

    /**
     * The open options that were shown, if any.
     */
    public get openOptions(): vscode.OpenDialogOptions | undefined {
        return this._openOptions
    }

    /**
     * The save options that were shown, if any.
     */
    public get saveOptions(): vscode.SaveDialogOptions | undefined {
        return this._saveOptions
    }

    /**
     * Selects the file(s) specified in the {@link openSelections}, if any.
     *
     * @returns a Promise of the {@link openSelections}.
     */
    public async showOpen(options: vscode.OpenDialogOptions): Promise<vscode.Uri[] | undefined> {
        this._openOptions = options
        return Promise.resolve(this._openSelections)
    }

    /**
     * Selects the file specified in the {@link saveSelection}, if any.
     *
     * @returns a Promise of the {@link saveSelection}.
     */
    public async showSave(options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined> {
        this._saveOptions = options
        return Promise.resolve(this._saveSelection)
    }

    public constructor({ openSelections, saveSelection }: FakeDialogOptions = {}) {
        this._openSelections = openSelections
        this._saveSelection = saveSelection
    }
}
