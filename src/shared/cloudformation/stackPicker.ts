/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../ui/picker'
import { ToolkitCancellationToken } from '../utilities/toolkitCancellationToken'

/**
 * Prompts user to select a CloudFormation Stack.
 */
export class CloudFormationStackPicker {
    public static readonly PICKER_CANCELLED: string = 'CloudFormationStackPicker.Cancelled'

    private _picker: vscode.QuickPick<vscode.QuickPickItem> | undefined
    private readonly pickerItems: vscode.QuickPickItem[] = []
    private readonly cancellationToken: ToolkitCancellationToken = new ToolkitCancellationToken()

    public constructor(private readonly stacks: AsyncIterableIterator<CloudFormation.StackSummary>) {
    }

    public async prompt(): Promise<string> {
        // Loading decorates the picker with "loading" status, then removes it on completion
        // tslint:disable-next-line:no-floating-promises
        this.loadStacks()

        const response = await promptUser({
            picker: this.picker,
            onDidTriggerButton: (sender, button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    sender.hide()
                    resolve(undefined)
                }
            }
        })

        this.cancellationToken.requestCancellation()

        const responseEntry = verifySinglePickerOutput(response)

        if (responseEntry) {
            return responseEntry.label
        }

        return CloudFormationStackPicker.PICKER_CANCELLED
    }

    protected createQuickPick(): vscode.QuickPick<vscode.QuickPickItem> {
        return createQuickPick(
            {
                options: {
                    ignoreFocusOut: true,
                    title: 'Select a CloudFormation Stack to deploy to', // TODO : CC : loc
                },
                items: this.pickerItems,
                buttons: [
                    vscode.QuickInputButtons.Back,
                    // todo : CC : create new stack button
                ]
            }
        )
    }

    private get picker(): vscode.QuickPick<vscode.QuickPickItem> {
        if (!this._picker) {
            this._picker = this.createQuickPick()
        }

        return this._picker
    }

    private set loading(loading: boolean) {
        this.picker.busy = loading
    }

    private async loadStacks(): Promise<void> {
        try {
            this.loading = true

            for await (const stack of this.stacks) {
                this.pickerItems.push({
                    label: stack.StackName,
                })

                this.pickerItems.sort((a, b) => a.label.localeCompare(b.label))
                this.picker.items = this.pickerItems

                if (this.cancellationToken.isCancellationRequested) { break }
            }
            // TODO : CC : Catch block
        } finally {
            this.loading = false
        }
    }
}
