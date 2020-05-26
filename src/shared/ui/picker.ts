/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { IteratingAWSCall } from '../utilities/collectionUtils'

/**
 * Options to configure the behavior of the quick pick UI.
 * Generally used to accommodate features not provided through vscode.QuickPickOptions
 */
export interface AdditionalQuickPickOptions {
    title?: string
    value?: string
}

/**
 * Creates a QuickPick to let the user pick an item from a list
 * of items of type T.
 *
 * Used to wrap createQuickPick and accommodate
 * a common set of features for the Toolkit.
 *
 * Parameters:
 *  options - initial picker configuration
 *  items - set of selectable vscode.QuickPickItem based items to initialize the picker with
 *  buttons - set of buttons to initialize the picker with
 * @return A new QuickPick.
 */
export function createQuickPick<T extends vscode.QuickPickItem>({
    options,
    items,
    buttons,
}: {
    options?: vscode.QuickPickOptions & AdditionalQuickPickOptions
    items?: T[]
    buttons?: vscode.QuickInputButton[]
}): vscode.QuickPick<T> {
    const picker = vscode.window.createQuickPick<T>()

    if (options) {
        picker.title = options.title
        picker.placeholder = options.placeHolder
        picker.value = options.value || ''
        if (options.matchOnDescription !== undefined) {
            picker.matchOnDescription = options.matchOnDescription
        }
        if (options.matchOnDetail !== undefined) {
            picker.matchOnDetail = options.matchOnDetail
        }
        if (options.ignoreFocusOut !== undefined) {
            picker.ignoreFocusOut = options.ignoreFocusOut
        }

        // TODO : Apply more options as they are needed in the future, and add corresponding tests
    }

    if (items) {
        picker.items = items
    }

    if (buttons) {
        picker.buttons = buttons
    }

    return picker
}

/**
 * Convenience method to allow the QuickPick to be treated more like a dialog.
 *
 * This method shows the picker, and returns after the picker is either accepted or cancelled.
 * (Accepted = the user accepted selected values, Cancelled = hide() is called or Esc is pressed)
 *
 * @param picker The picker to prompt the user with
 * @param onDidTriggerButton Optional event to trigger when the picker encounters a "Button Pressed" event.
 *  Buttons do not automatically cancel/accept the picker, caller must explicitly do this if intended.
 *
 * @returns If the picker was cancelled, undefined is returned. Otherwise, an array of the selected items is returned.
 */
export async function promptUser<T extends vscode.QuickPickItem>({
    picker,
    onDidTriggerButton,
}: {
    picker: vscode.QuickPick<T>
    onDidTriggerButton?(
        button: vscode.QuickInputButton,
        resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
        reject: (reason?: any) => void
    ): void
}): Promise<T[] | undefined> {
    const disposables: vscode.Disposable[] = []

    try {
        const response = await new Promise<T[] | undefined>((resolve, reject) => {
            picker.onDidAccept(
                () => {
                    resolve(Array.from(picker.selectedItems))
                },
                picker,
                disposables
            )

            picker.onDidHide(
                () => {
                    resolve(undefined)
                },
                picker,
                disposables
            )

            if (onDidTriggerButton) {
                picker.onDidTriggerButton(
                    (btn: vscode.QuickInputButton) => onDidTriggerButton(btn, resolve, reject),
                    picker,
                    disposables
                )
            }

            picker.show()
        })

        return response
    } finally {
        disposables.forEach(d => d.dispose() as void)
        picker.hide()
    }
}

export function verifySinglePickerOutput<T extends vscode.QuickPickItem>(choices: T[] | undefined): T | undefined {
    const logger = getLogger()
    if (!choices || choices.length === 0) {
        return undefined
    }

    if (choices.length > 1) {
        logger.warn(
            `Received ${choices.length} responses from user, expected 1.` +
                ' Cancelling to prevent deployment of unexpected template.'
        )

        return undefined
    }

    return choices[0]
}

// TODO: Cache these results?
export class IteratingAWSCallPicker<TRequest, TResponse> {
    private isDone: boolean = false
    private isPaused: boolean = false
    private items: vscode.QuickPickItem[] = []

    private readonly quickPick: vscode.QuickPick<vscode.QuickPickItem>
    private readonly moreItemsRequest: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()

    /**
     * @param awsCallLogic: Object representing the call to be used, the initial request, and a function that converts from a response object to an array of quick pick items
     * @param pickerOptions: Object representing QuickPick options, additional buttons, and any additional functionality to be called upon selecting a button.
     */
    public constructor(
        private readonly awsCallLogic: {
            // TODO: allow for creation of a new call in case we want to reload quick pick in its entirety
            iteratingAwsCall: IteratingAWSCall<TRequest, TResponse>
            initialRequest: TRequest
            awsResponseToQuickPickItem: (response: TResponse) => vscode.QuickPickItem[]
        },
        private readonly pickerOptions: {
            options?: vscode.QuickPickOptions & AdditionalQuickPickOptions
            buttons?: vscode.QuickInputButton[]
            onDidTriggerButton?: (
                button: vscode.QuickInputButton,
                resolve: (
                    value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined
                ) => void,
                reject: (reason?: any) => void
            ) => void
        } = {}
    ) {
        // TODO: Create default buttons for load next page, refresh
        // TODO: Set a global throttling flag that will optionally display said load next page button
        this.quickPick = createQuickPick<vscode.QuickPickItem>({
            options: {
                ...this.pickerOptions.options,
                onDidSelectItem: item => {
                    // pause any existing execution
                    this.isPaused = true
                    // pass existing onDidSelectItem through if it exists
                    if (this.pickerOptions.options?.onDidSelectItem) {
                        this.pickerOptions.options.onDidSelectItem(item)
                    }
                },
            },
            items: this.items,
            buttons: this.pickerOptions.buttons,
        })

        this.moreItemsRequest.event(() => this.loadItems())
    }

    /**
     * Prompts the user with the quick pick specified by the constructor.
     * Always attempts to load new results from the iteratingAwsCall, even if the call has been exhausted.
     * If the call picker was previously paused, unpauses it.
     */
    public async promptUser(): Promise<vscode.QuickPickItem[] | undefined> {
        // start background loading and unpause the loader (if it was paused previously by a selection)
        this.quickPick.busy = true
        this.isPaused = false
        if (!this.isDone) {
            this.moreItemsRequest.fire()
        }
        return await promptUser<vscode.QuickPickItem>({
            picker: this.quickPick,
            onDidTriggerButton: this.pickerOptions.onDidTriggerButton,
        })
    }

    // TODO: Add nodes for no items, error (error retries call from where it left off?)
    private async loadItems(): Promise<void> {
        const iter = this.awsCallLogic.iteratingAwsCall.getIteratorForRequest(this.awsCallLogic.initialRequest)

        for await (const item of iter) {
            if (!this.isDone && !this.isPaused) {
                this.items = this.items.concat(this.awsCallLogic.awsResponseToQuickPickItem(item))
                // TODO: Is there a way to append to this ReadOnlyArray so it doesn't constantly pop focus back to the top?
                this.quickPick.items = this.items
            } else {
                break
            }
        }
        this.isDone = true
        this.quickPick.busy = false
    }
}
