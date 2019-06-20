/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export class MockQuickPick<T extends vscode.QuickPickItem> implements vscode.QuickPick<T> {
    public value: string = ''
    public placeholder: string | undefined
    public readonly onDidChangeValue: vscode.Event<string>
    public readonly onDidAccept: vscode.Event<void>
    public readonly onDidHide: vscode.Event<void>
    public buttons: ReadonlyArray<vscode.QuickInputButton> = []
    public readonly onDidTriggerButton: vscode.Event<vscode.QuickInputButton>
    public items: ReadonlyArray<T> = []
    public canSelectMany: boolean = false
    public matchOnDescription: boolean = false
    public matchOnDetail: boolean = false
    public activeItems: ReadonlyArray<T> = []
    public readonly onDidChangeActive: vscode.Event<T[]>
    public selectedItems: ReadonlyArray<T> = []
    public readonly onDidChangeSelection: vscode.Event<T[]>
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
    private readonly onDidChangeActiveEmitter: vscode.EventEmitter<T[]> = new vscode.EventEmitter()
    private readonly onDidChangeSelectionEmitter: vscode.EventEmitter<T[]> = new vscode.EventEmitter()
    private readonly onDidTriggerButtonEmitter: vscode.EventEmitter<vscode.QuickInputButton> =
        new vscode.EventEmitter()

    public constructor(params: {
        onShow?(sender: MockQuickPick<T>): void
    }) {
        this.onDidHide = this.onDidHideEmitter.event
        this.onDidAccept = this.onDidAcceptEmitter.event
        this.onDidChangeValue = this.onDidChangeValueEmitter.event
        this.onDidChangeActive = this.onDidChangeActiveEmitter.event
        this.onDidChangeSelection = this.onDidChangeSelectionEmitter.event
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
    public accept(value: T[]) {
        this.selectedItems = value
        this.onDidAcceptEmitter.fire()
        this.isShowing = false
    }
    public dispose(): void {
    }

    public pressButton(button: vscode.QuickInputButton) {
        this.onDidTriggerButtonEmitter.fire(button)
    }

    private onShow?(quickPick: MockQuickPick<T>): void
}
