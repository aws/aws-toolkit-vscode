/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { StepEstimator, WIZARD_BACK } from '../../wizards/wizard'
import { Prompter, PromptResult } from '../prompter'

/**
 * Implementation of {@link vscode.window.showOpenDialog showOpenDialog} as a {@link Prompter}.
 */
export class OpenDialogPrompter extends Prompter<vscode.Uri[]> {
    private _recentItem: vscode.Uri[] = []
    public get recentItem(): vscode.Uri[] {
        return this._recentItem
    }
    public set recentItem(response: vscode.Uri[]) {
        // TODO(sijaden): should add a check for accidently using the getter/setter instead of the private field
        // using the setter -> results in a stack overflow...
        this._recentItem = response
    }
    constructor(private readonly options: vscode.OpenDialogOptions = {}) {
        super()
        // TODO(sijaden): ideally the `recentItem` should be all the files the user had previously selected, though
        // currently this is not possible
        this._recentItem = options.defaultUri ? [options.defaultUri] : []
    }
    protected async promptUser(): Promise<PromptResult<vscode.Uri[]>> {
        const files = await vscode.window.showOpenDialog({
            ...this.options,
            defaultUri: this._recentItem[0],
        })
        this._recentItem = files ?? this._recentItem

        return files ?? WIZARD_BACK
    }

    // Stub functions. This do not mean anything for this dialog.
    public setStepEstimator(estimator: StepEstimator<vscode.Uri[]>): void {}
    public setSteps(current: number, total: number): void {}
}

type DialogOptions = Omit<vscode.OpenDialogOptions, 'canSelectMany'>

export function createMultiFileDialog(options?: DialogOptions): Prompter<vscode.Uri[]> {
    const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
    return new OpenDialogPrompter({ defaultUri, ...options, canSelectMany: true })
}

export function createSingleFileDialog(options?: DialogOptions): Prompter<vscode.Uri> {
    const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
    return new OpenDialogPrompter({ defaultUri, ...options, canSelectMany: false }).transform(r => r[0])
}
