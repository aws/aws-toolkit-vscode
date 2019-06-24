/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../ui/picker'
import { ItemsLoader, ItemsLoaderEndEvent } from '../utilities/itemsLoader'

export interface CloudFormationStackPickerItem extends vscode.QuickPickItem {
    isError: boolean
}

export const noStacksPickerItem: CloudFormationStackPickerItem = {
    isError: false,
    label: localize('AWS.cloudformation.picker.no.stacks.found', 'No Stacks could be found in this region'),
    description: localize(
        'AWS.cloudformation.picker.no.stacks.found.description',
        'Click here to enter a new Stack name'
    ),
}

export interface CloudFormationStackPickerResponse {
    cancelled: boolean,
    inputText?: string,
    createStackButtonPressed: boolean
}

/**
 * Prompts user to select a CloudFormation Stack.
 * Callers should call dispose() when they are finished using the object.
 */
export class CloudFormationStackPicker {
    private readonly extensionContext: vscode.ExtensionContext

    private readonly pickerItems: CloudFormationStackPickerItem[] = []
    private readonly createNewStackButton: vscode.QuickInputButton
    private readonly disposables: vscode.Disposable[] = []

    private loading: boolean = false
    private picker: vscode.QuickPick<CloudFormationStackPickerItem> | undefined

    // TODO : CC : Additional buttons (help button)
    public constructor(parameters: {
        stacksLoader: ItemsLoader<CloudFormation.StackSummary>,
        extensionContext: vscode.ExtensionContext,
    }) {
        this.extensionContext = parameters.extensionContext

        this.createNewStackButton = makeCreateNewStackButton(this.extensionContext)

        parameters.stacksLoader.onLoadStart(() => this.onLoadStart(), undefined, this.disposables)
        parameters.stacksLoader.onItem((itm) => this.onNewStack(itm), undefined, this.disposables)
        parameters.stacksLoader.onLoadEnd((event) => this.onLoadEnd(event), undefined, this.disposables)
    }

    /**
     * This function can be called several times over the lifetime of a CloudFormationStackPicker object.
     */
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

    protected createQuickPick(): vscode.QuickPick<CloudFormationStackPickerItem> {
        const picker = createQuickPick(
            {
                options: {
                    ignoreFocusOut: true,
                    title: localize(
                        'AWS.cloudformation.picker.select.stack',
                        'Select a CloudFormation Stack to deploy to'
                    ),
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

    private onLoadEnd(event: ItemsLoaderEndEvent): void {
        if (event.success) {
            if (this.pickerItems.length === 0) {
                this.pickerItems.push(noStacksPickerItem)
            }
        } else if (event.error) {
            this.pickerItems.push({
                isError: true,
                label: localize(
                    'AWS.cloudformation.picker.error',
                    'There was an issue trying to load CloudFormation Stacks'
                ),
                detail: event.error.message,
            })
        }

        this.loading = false

        this.updatePickerState()
    }

    private onNewStack(stackSummary: CloudFormation.StackSummary): void {
        this.pickerItems.push({
            isError: false,
            label: stackSummary.StackName,
        })

        this.pickerItems.sort((a, b) => a.label.localeCompare(b.label))

        this.updatePickerState()
    }

    private async promptUserToSelectStack(): Promise<CloudFormationStackPickerResponse> {
        if (!this.picker) { throw new Error('promptUserToSelectStack was called prior to initializing a picker') }

        let selectedButton: vscode.QuickInputButton | undefined
        const promptResponse = await promptUser<CloudFormationStackPickerItem>({
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

        if (!responseEntry || responseEntry.isError) {
            // Treat these cases like a cancel
            return makeCancelledCloudFormationStackPickerResponse()
        }

        if (responseEntry === noStacksPickerItem) {
            return this.makeButtonSelectionCloudFormationStackPickerResponse(this.createNewStackButton)
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

function makeCreateNewStackButton(extensionContext: vscode.ExtensionContext): vscode.QuickInputButton {
    return {
        iconPath: {
            dark: vscode.Uri.file(extensionContext.asAbsolutePath('third-party/resources/from-vscode/dark/add.svg')),
            light: vscode.Uri.file(extensionContext.asAbsolutePath('third-party/resources/from-vscode/light/add.svg')),
        },
        tooltip: localize('AWS.cloudformation.picker.button.new.stack', 'Add new CloudFormation Stack'),
    }
}
