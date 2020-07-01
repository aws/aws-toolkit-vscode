/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getLogger } from '../logger'

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
    // test
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
// If we move this to a cache, we should remove the awsCallLogic and instead listen/send events to/from the cache.
// (this should also be retooled to not use the request/response objects directly)
// TODO: Add manual pagination?
/**
 * Grants a `vscode.QuickPick` iteration capabilities:
 * * Pause/unpause loading
 * * Refresh capabilities
 * * No item/error nodes
 *
 * External control is still done via `picker.promptUser` as if it were a normal QuickPick.
 */
export class IteratingQuickPickController<TResponse> {
    private isDone: boolean = false
    private isPaused: boolean = false
    private iterator: AsyncIterator<vscode.QuickPickItem[]>
    private activeIterationTime: Date

    // Default constructs are public static so they can be validated aganist by other functions.
    public static readonly REFRESH_BUTTON: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('refresh'),
        tooltip: localize('AWS.generic.refresh', 'Refresh'),
    }
    public static readonly NO_ITEMS_ITEM: vscode.QuickPickItem = {
        label: localize('AWS.picker.dynamic.noItemsFound.label', '[No items found]'),
        detail: localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back'),
        alwaysShow: true,
    }
    public static readonly ERROR_ITEM: vscode.QuickPickItem = {
        label: localize('AWS.picker.dynamic.errorNode.label', 'There was an error retrieving more items.'),
        alwaysShow: true,
    }

    /**
     * @param quickPick A `vscode.QuickPick` to grant iterating capabilities
     * @param populator An IteratingQuickPickPopulator which can call an iterator and return QuickPickItems.
     */
    public constructor(
        private readonly quickPick: vscode.QuickPick<vscode.QuickPickItem>,
        private readonly populator: IteratingQuickPickPopulator<TResponse>
    ) {
        // append buttons specific to iterating quickPick
        this.quickPick.buttons = [...this.quickPick.buttons, IteratingQuickPickController.REFRESH_BUTTON]

        this.iterator = this.populator.getPickIterator()

        this.activeIterationTime = new Date()
    }

    /**
     * Pauses any existing item loading.
     * Call upon selecting an item in order to pause additional background loading.
     */
    public pauseRequests(): void {
        this.isPaused = true
    }

    /**
     * Starts item loading. Restarts from existing state if paused.
     * Useful for manual pagination, losing quick pick focus (e.g. via external link), throttling, etc.
     */
    public startRequests(): void {
        this.loadItems(false)
    }

    /**
     * Resets quick pick's state. Useful for manual refreshes with the same query parameters
     */
    public reset(): void {
        this.loadItems(true)
    }

    private async loadItems(reset: boolean): Promise<void> {
        if (reset) {
            this.activeIterationTime = new Date()
            this.isDone = false
            this.populator.reset()
            this.iterator = this.populator.getPickIterator()
        }
        const scopeIterationTime = this.activeIterationTime

        // unpause the loader (if it was paused previously by a selection)
        this.isPaused = false

        // use a while loop so we have greater control over the iterator.
        // breaking out of a for..of loop for an iterator will automatically set the iterator to `done`
        // manual iteration means that we can use the same iterator no matter how many times we call loadItems()
        while (!this.isDone && !this.isPaused) {
            this.quickPick.busy = true
            try {
                const newItems = await this.iterator.next()
                if (!newItems) {
                    this.isDone = true
                    break
                }
                // TODO: Is there a way to append to this ReadOnlyArray so it doesn't constantly pop focus back to the top?
                // on reset, first iteration should clear the quickPick's items.
                // should handle cases where call latencies are stable
                if (scopeIterationTime === this.activeIterationTime) {
                    this.quickPick.items = reset ? newItems.value : this.quickPick.items.concat(newItems.value)
                    // nothing else to reset from here on out
                    reset = false
                    this.isDone = newItems.done ?? false
                } else {
                    // another newer iteration cycle is in-flight. Break without mutating state.
                    break
                }
            } catch (e) {
                // append error node
                // clicking error node should either go backwards (return undefined) or refresh
                // maybe have one of each?
                // give quickpick an error message
                // we should not blow away the existing items, they should still be viable
                const err = e as Error
                this.quickPick.items = [
                    ...this.quickPick.items,
                    {
                        ...IteratingQuickPickController.ERROR_ITEM,
                        detail: err.message,
                    },
                ]
                this.isDone = true
            }
        }

        // wrap up, but only if the fucntion call is the currently active one.
        if (scopeIterationTime === this.activeIterationTime) {
            // no items in response
            if (this.isDone && this.quickPick.items.length === 0) {
                this.quickPick.items = [IteratingQuickPickController.NO_ITEMS_ITEM]
            }

            // disable loading bar
            this.quickPick.busy = false
        }
    }
}

/**
 * Represents an iterator that tranforms another iterator into an array of QuickPickItems.
 * Additionally, has a reset functionality to reset the iterator to its initial state.
 */
export class IteratingQuickPickPopulator<TResponse> {
    private iterator: AsyncIterator<TResponse>

    /**
     * @param iteratorFactory Function that returns an iterator, with all default state values set. E.g. `collectionUtils.getPaginatedAwsCallIter`
     * @param transform Function which transforms a response from the iterator into an array of `vscode.QuickPickItem`s.
     */
    public constructor(
        private readonly iteratorFactory: () => AsyncIterator<TResponse>,
        private readonly transform: (response: TResponse) => vscode.QuickPickItem[]
    ) {
        this.iterator = this.iteratorFactory()
    }

    /**
     * Resets the iterator to the default state provided by the iteratorFactory.
     */
    public reset(): void {
        this.iterator = this.iteratorFactory()
    }

    /**
     * Generates an iterator which returns an array of formatted QuickPickItems on `.next()`
     */
    public async *getPickIterator(): AsyncIterator<vscode.QuickPickItem[]> {
        while (true) {
            const nextResult = await this.iterator.next()
            const transformedResult = this.transform(nextResult.value)

            // return (instead of yield) marks final value as done
            if (nextResult.done) {
                return transformedResult
            }

            yield transformedResult
        }
    }
}

/**
 * Shim function for picker.promptUser calls on pickers that use iteratingQuickPickControllers.
 * Wraps refresh functionality for this controller and otherwise passes through to a user-provided onDidTriggerButton function
 * @param button Provided by promptUser
 * @param resolve Provided by promptUser
 * @param reject Provided by promptUser
 * @param iteratingQuickPickController IteratingQuickPickController to call actions on
 * @param onDidTriggerButton Optional passthrough onDidTriggerButton functionality for promptUser
 */
export async function iteratingOnDidTriggerButton<T>(
    button: vscode.QuickInputButton,
    resolve: (value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined) => void,
    reject: (reason?: any) => void,
    iteratingQuickPickController: IteratingQuickPickController<T>,
    onDidTriggerButton?: (
        button: vscode.QuickInputButton,
        resolve: (value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined) => void,
        reject: (reason?: any) => void
    ) => Promise<vscode.QuickPickItem[] | undefined>
): Promise<vscode.QuickPickItem[] | undefined> {
    switch (button) {
        case IteratingQuickPickController.REFRESH_BUTTON:
            iteratingQuickPickController.reset()
            return undefined
        default:
            return onDidTriggerButton ? onDidTriggerButton(button, resolve, reject) : undefined
    }
}
