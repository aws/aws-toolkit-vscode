/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export class MockInputBox implements vscode.InputBox {
    public value: string = ''
    public placeholder: string | undefined
    public password: boolean = false
    public readonly onDidChangeValue: vscode.Event<string>
    public readonly onDidAccept: vscode.Event<void>
    public readonly onDidHide: vscode.Event<void>
    public buttons: ReadonlyArray<vscode.QuickInputButton> = []
    public readonly onDidTriggerButton: vscode.Event<vscode.QuickInputButton>
    public prompt: string | undefined
    public validationMessage: string | undefined
    public title: string | undefined
    public step: number | undefined
    public totalSteps: number | undefined
    public enabled: boolean = true
    public busy: boolean = false
    public ignoreFocusOut: boolean = false

    public isShowing: boolean = false

    private readonly onDidHideEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
    private readonly onDidAcceptEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
    private readonly onDidChangeValueEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter()
    private readonly onDidTriggerButtonEmitter: vscode.EventEmitter<vscode.QuickInputButton> =
        new vscode.EventEmitter()

    public constructor(params: {
        onShow?(inputBox: MockInputBox): void
    }) {
        this.onDidHide = this.onDidHideEmitter.event
        this.onDidAccept = this.onDidAcceptEmitter.event
        this.onDidChangeValue = this.onDidChangeValueEmitter.event
        this.onDidTriggerButton = this.onDidTriggerButtonEmitter.event

        this.onShow = params.onShow
    }

    public show(): void {
        this.isShowing = true
        if (this.onShow) {
            this.onShow(this)
        }
    }
    public hide(): void {
        this.onDidHideEmitter.fire()
        this.isShowing = false
    }
    public setValue(value: string) {
        if (this.value !== value) {
            this.value = value
            this.onDidChangeValueEmitter.fire(value)
        }
    }
    public accept(value: string) {
        this.setValue(value)
        this.onDidAcceptEmitter.fire()
        this.isShowing = false
    }
    public dispose(): void {
    }

    public pressButton(button: vscode.QuickInputButton) {
        this.onDidTriggerButtonEmitter.fire(button)
    }

    private onShow?(inputBox: MockInputBox): void
}
