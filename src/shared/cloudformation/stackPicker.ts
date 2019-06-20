/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../ui/picker'

export interface CloudFormationStackPickerResponse {
    cancelled: boolean,
    inputText?: string,
    createStackButtonPressed: boolean
}

// TODO : CC : Move CloudFormationStacksLoader somewhere more central
export interface CloudFormationStacksLoader {
    onLoadStart: vscode.Event<void>
    onItem: vscode.Event<CloudFormation.StackSummary>
    onLoadEnd: vscode.Event<void>
    // TODO : CC : Error situations
}

// todo : CC : Move BaseCloudFormationStacksLoader somewhere more central
export abstract class BaseCloudFormationStacksLoader implements CloudFormationStacksLoader {
    protected readonly loadStartEmitter = new vscode.EventEmitter<void>()
    protected readonly loadEndEmitter = new vscode.EventEmitter<void>()

    protected readonly itemEmitter: vscode.EventEmitter<CloudFormation.StackSummary> =
        new vscode.EventEmitter<CloudFormation.StackSummary>()

    public get onLoadStart(): vscode.Event<void> {
        return this.loadStartEmitter.event
    }

    public get onItem(): vscode.Event<CloudFormation.StackSummary> {
        return this.itemEmitter.event
    }

    public get onLoadEnd(): vscode.Event<void> {
        return this.loadEndEmitter.event
    }
}

/**
 * Prompts user to select a CloudFormation Stack.
 * Callers should call dispose() when they are finished using the object.
 */
export class CloudFormationStackPicker {
    private readonly pickerItems: vscode.QuickPickItem[] = []
    private readonly createNewStackButton: vscode.QuickInputButton = makeCreateNewStackButton()
    private readonly disposables: vscode.Disposable[] = []

    private loading: boolean = false
    private picker: vscode.QuickPick<vscode.QuickPickItem> | undefined

    public constructor(emitter: CloudFormationStacksLoader) {
        emitter.onLoadStart(() => this.onLoadStart(), undefined, this.disposables)
        emitter.onItem((itm) => this.onNewStack(itm), undefined, this.disposables)
        emitter.onLoadEnd(() => this.onLoadEnd(), undefined, this.disposables)
    }

    public async prompt(): Promise<CloudFormationStackPickerResponse> {
        try {
            this.initializePicker()

            return await this.promptUserToSelectStack()
        } finally {
            this.disposePicker()
        }
    }

    public dispose(): void {
        this.disposables.forEach(d => {
            vscode.Disposable.from(d).dispose()
        })
        this.disposables.splice(0, this.disposables.length)

        this.disposePicker()
    }

    protected createQuickPick(): vscode.QuickPick<vscode.QuickPickItem> {
        const picker = createQuickPick(
            {
                options: {
                    ignoreFocusOut: true,
                    title: 'Select a CloudFormation Stack to deploy to', // TODO : CC : loc
                },
                items: this.pickerItems,
                buttons: [
                    vscode.QuickInputButtons.Back,
                    this.createNewStackButton,
                ]
            }
        )

        return picker
    }

    private onLoadStart(): void {
        this.loading = true

        this.updatePickerState()
    }

    private onLoadEnd(): void {
        this.loading = false

        this.updatePickerState()
    }

    private onNewStack(stackSummary: CloudFormation.StackSummary): void {
        this.pickerItems.push({
            label: stackSummary.StackName,
        })

        this.pickerItems.sort((a, b) => a.label.localeCompare(b.label))

        this.updatePickerState()
    }

    private async promptUserToSelectStack(): Promise<CloudFormationStackPickerResponse> {
        // TODO : CC : Error check
        if (!this.picker) { throw new Error('qqqq') }

        let selectedButton: vscode.QuickInputButton | undefined
        const promptResponse = await promptUser({
            picker: this.picker,
            onDidTriggerButton: async (sender, button, resolve, reject) => {
                selectedButton = button
                sender.hide()
                resolve(undefined)
            }
        })

        if (selectedButton) {
            return this.makeButtonSelectionCloudFormationStackPickerResponse(selectedButton)
        }

        const responseEntry = verifySinglePickerOutput(promptResponse)

        if (!responseEntry) {
            // we don't expect this state, but we will treat it like a cancel
            return makeCancelledCloudFormationStackPickerResponse()
        }

        return makeSelectedItemCloudFormationStackPickerResponse(responseEntry)
    }

    private makeButtonSelectionCloudFormationStackPickerResponse(
        selectedButton: vscode.QuickInputButton
    ): CloudFormationStackPickerResponse {
        switch (selectedButton) {
            case vscode.QuickInputButtons.Back:
                return makeCancelledCloudFormationStackPickerResponse()
                break
            case this.createNewStackButton:
                return {
                    cancelled: false,
                    createStackButtonPressed: true
                }
                break
            default:
                throw new Error(`Unhandled button: ${selectedButton}`)
        }
    }

    private initializePicker(): void {
        this.disposePicker()

        this.picker = this.createQuickPick()
        this.updatePickerState()
    }

    private updatePickerState(): void {
        if (!this.picker) {
            return
        }

        this.picker.items = this.pickerItems

        if (this.picker.busy !== this.loading) {
            this.picker.busy = this.loading
        }
    }

    private disposePicker(): void {
        if (this.picker) {
            const picker = this.picker
            this.picker = undefined
            picker.dispose()
        }
    }
}

function makeCancelledCloudFormationStackPickerResponse(): CloudFormationStackPickerResponse {
    return {
        cancelled: true,
        createStackButtonPressed: false,
    }
}

function makeSelectedItemCloudFormationStackPickerResponse(
    selectedItem: vscode.QuickPickItem
): CloudFormationStackPickerResponse {
    return {
        cancelled: false,
        createStackButtonPressed: false,
        inputText: selectedItem.label,
    }
}

function makeCreateNewStackButton(): vscode.QuickInputButton {
    return {
        iconPath: {
            // todo : CC : bring in button images
            // todo : CC : proper button pathing
            dark: vscode.Uri.file('resources/dark/add.svg'),
            light: vscode.Uri.file('resources/light/add.svg'),
        },
        // TODO : CC : loc
        tooltip: 'add the new stack',
    }
}
