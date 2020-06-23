/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getLogger } from '../logger'
import { getPaginatedAwsCallIter, getPaginatedAwsCallIterParams } from '../utilities/collectionUtils'

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

// TODO: Cache these results? Should we have a separate store? Can we also use a store with values from the explorer tree?
export class IteratingAWSCallPicker<TRequest, TResponse> {
    private isDone: boolean = false
    private isPaused: boolean = false
    // TODO: Is this necessary or should we just use this.quickPick.items directly?
    private items: vscode.QuickPickItem[] = []
    private iterator: AsyncIterator<TResponse>

    private readonly quickPick: vscode.QuickPick<vscode.QuickPickItem>
    private readonly moreItemsRequest: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    private readonly refreshButton: vscode.QuickInputButton
    private readonly paginationButton: vscode.QuickInputButton

    // these QuickPickItems are public so users can check against their label to determine if the item isn't valid
    public readonly noItemsItem: vscode.QuickPickItem
    public readonly errorItem: vscode.QuickPickItem

    /**
     * @param awsCallLogic: Object representing the call to be used, the initial request parameters, and a function that converts from a response object to an array of quick pick items
     * @param pickerOptions: Object representing QuickPick options, additional buttons, any additional functionality to be called upon selecting a button, whether or not the quick pick should be refreshable, and whether manual pagination should be used
     */
    public constructor(
        private readonly awsCallLogic: {
            // TODO: allow for creation of a new call in case we want to reload quick pick in its entirety
            iteratorParams: getPaginatedAwsCallIterParams<TRequest, TResponse>
            awsCallResponseToQuickPickItemFn: (response: TResponse) => vscode.QuickPickItem[]
            noItemsMessage?: string
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
            isRefreshable?: boolean
            manualPaginationType?: 'append' | 'replace'
        } = {}
    ) {
        this.iterator = this.createNewIterator()

        this.refreshButton = {
            iconPath: new vscode.ThemeIcon('refresh'),
            tooltip: localize('AWS.generic.refresh', 'Refresh'),
        }
        this.paginationButton = {
            // TODO: Find better icon
            iconPath: new vscode.ThemeIcon('add'),
            tooltip:
                this.pickerOptions.manualPaginationType === 'append'
                    ? localize('AWS.picker.dynamic.nextPage.append', 'Load Next Page...')
                    : localize('AWS.picker.dynamic.nextPage', 'Next Page...'),
        }
        this.noItemsItem = {
            label:
                this.awsCallLogic.noItemsMessage ??
                localize('AWS.picker.dynamic.noItemsFound.label', 'No items found.'),
            detail: localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back'),
            alwaysShow: true,
        }
        this.errorItem = {
            label: localize('AWS.picker.dynamic.errorNode.label', 'There was an error retrieving more items.'),
            alwaysShow: true,
        }

        const quickPickButtons = this.pickerOptions.buttons || []
        if (this.pickerOptions.isRefreshable) {
            quickPickButtons.push(this.refreshButton)
        }
        // is this the correct impl? If so, is this the correct icon?
        // e.g. use a button like this or add quickpick item at the end of the list?
        if (this.pickerOptions.manualPaginationType) {
            quickPickButtons.push(this.paginationButton)
        }

        // TODO: Create default buttons for load next page, refresh
        // TODO: Set a global throttling flag that will optionally display said load next page button
        this.quickPick = createQuickPick<vscode.QuickPickItem>({
            options: {
                ...this.pickerOptions.options,
                onDidSelectItem: item => {
                    // pause any existing execution
                    this.isPaused = true

                    // pass existing onDidSelectItem through if it exists and isn't a base case
                    if (this.pickerOptions.options?.onDidSelectItem) {
                        this.pickerOptions.options.onDidSelectItem(item)
                    }
                },
            },
            items: this.items,
            buttons: quickPickButtons,
        })

        this.moreItemsRequest.event(() => this.loadItems())
    }

    /**
     * Prompts the user with the quick pick specified by the constructor.
     * Always attempts to load new results from the iteratingAwsCall, even if the call has been exhausted.
     * If the call picker was previously paused, unpauses it.
     */
    public async promptUser(): Promise<vscode.QuickPickItem[] | undefined> {
        if (!this.isDone) {
            this.moreItemsRequest.fire()
        }
        return await promptUser<vscode.QuickPickItem>({
            picker: this.quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                // pause any existing execution
                this.isPaused = true
                switch (button) {
                    case this.refreshButton:
                        this.isPaused = true
                        this.refreshQuickPick()
                        this.moreItemsRequest.fire()
                        return
                    case this.paginationButton:
                        this.isPaused = false
                        this.moreItemsRequest.fire()
                        return
                    // pass existing onDidTriggerButton through if it exists and wasn't a native button
                    default:
                        if (this.pickerOptions.onDidTriggerButton) {
                            this.pickerOptions.onDidTriggerButton(button, resolve, reject)
                        }
                }
            },
        })
    }

    private async loadItems(): Promise<void> {
        // unpause the loader (if it was paused previously by a selection)
        this.isPaused = false

        // use a while loop so we have greater control over the iterator.
        // breaking out of a for..of loop for an iterator will automatically set the iterator to `done`
        // manual iteration means that we can use the same iterator no matter how many times we call loadItems()
        while (!this.isDone && !this.isPaused) {
            this.quickPick.busy = true
            try {
                const item = await this.iterator.next()
                if (!item) {
                    this.isDone = true
                    break
                }
                const nextItems = this.awsCallLogic.awsCallResponseToQuickPickItemFn(item.value)
                this.items =
                    this.pickerOptions.manualPaginationType === 'replace' ? nextItems : this.items.concat(nextItems)
                // TODO: Is there a way to append to this ReadOnlyArray so it doesn't constantly pop focus back to the top?
                this.quickPick.items = this.items
                // if this is manually paginated, pause the load after one pull
                if (this.pickerOptions.manualPaginationType) {
                    this.isPaused = true
                }
                this.isDone = item.done ?? false
            } catch (e) {
                // append error node
                // clicking error node should either go backwards (return undefined) or refresh
                // maybe have one of each?
                // give quickpick an error message
                // we should not blow away the existing items
                const err = e as Error
                this.items.push({
                    ...this.errorItem,
                    detail: err.message,
                })
                this.quickPick.items = this.items
            }
        }

        if (this.isDone && this.items.length === 0) {
            this.items.push(this.noItemsItem)
            this.quickPick.items = this.items
        }
        this.quickPick.busy = false
    }

    private refreshQuickPick(): void {
        this.items = []
        this.isDone = false
        this.quickPick.items = this.items
        this.iterator = this.createNewIterator()
    }

    /**
     * Generates a new iterator. Used at construction and during a "refresh" scenario.
     */
    private createNewIterator(): AsyncIterator<TResponse> {
        return getPaginatedAwsCallIter(this.awsCallLogic.iteratorParams)
    }
}
