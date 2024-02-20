/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getLogger } from '../logger'
import { IteratorTransformer } from '../utilities/collectionUtils'
import { createRefreshButton } from './buttons'

/**
 * Options to configure the behavior of the quick pick UI.
 * Generally used to accommodate features not provided through vscode.QuickPickOptions
 */
export interface AdditionalQuickPickOptions {
    title?: string
    value?: string
    step?: number
    totalSteps?: number
}

/**
 * @deprecated Use 'pickerPrompter.ts' instead
 *
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
    picker.keepScrollPosition = true

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
        picker.step = options.step
        picker.totalSteps = options.totalSteps

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
    private state: IteratingQuickPickControllerState
    private readonly refreshButton = createRefreshButton()

    // Default constructs are public static so they can be validated aganist by other functions.

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly NO_ITEMS_ITEM: vscode.QuickPickItem = {
        label: localize('AWS.picker.dynamic.noItemsFound.label', '[No items found]'),
        detail: localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back'),
        alwaysShow: true,
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly ERROR_ITEM: vscode.QuickPickItem = {
        label: localize('AWS.picker.dynamic.errorNode.label', 'Failed to load more items.'),
        alwaysShow: true,
    }

    /**
     * @param quickPick A `vscode.QuickPick` to grant iterating capabilities
     * @param populator An IteratingQuickPickPopulator which can call an iterator and return QuickPickItems.
     */
    public constructor(
        private readonly quickPick: vscode.QuickPick<vscode.QuickPickItem>,
        private readonly populator: IteratorTransformer<TResponse, vscode.QuickPickItem>,
        private readonly onDidTriggerButton?: (
            button: vscode.QuickInputButton,
            resolve: (
                value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined
            ) => void,
            reject: (reason?: any) => void
        ) => Promise<vscode.QuickPickItem[] | undefined>
    ) {
        // append buttons specific to iterating quickPick
        this.quickPick.buttons = [...this.quickPick.buttons, this.refreshButton]
        this.quickPick.onDidHide(() => {
            // on selection, not "done" but we do want to stop background loading.
            // the caller should own the quick pick lifecycle, so we can either restart the picker from where it left off or dispose at that level.
            getLogger().debug('IteratingQuickPickController item selected. Pausing additional loading.')
            this.state.isRunning = false
        })

        this.state = new IteratingQuickPickControllerState(this.populator.createPickIterator())
    }

    /**
     * Pauses any existing item loading.
     * Call upon selecting an item in order to pause additional background loading.
     */
    public pauseRequests(): void {
        getLogger().debug('Pausing IteratingQuickPickController')
        this.state.isRunning = false
    }

    /**
     * Starts item loading. Restarts from existing state if paused.
     * Useful for manual pagination, losing quick pick focus (e.g. via external link), throttling, etc.
     */
    public startRequests(): void {
        getLogger().debug('Starting IteratingQuickPickController iteration')
        if (this.state.isRunning) {
            getLogger().debug('IteratingQuickPickController already iterating')
            return
        }
        if (this.state.isDone) {
            getLogger().debug('IteratingQuickPickController is already done iterating. Call reset() and start again')
            return
        }
        this.loadItems().catch(e => {
            getLogger().error('IteratingQuickPickController: loadItems failed: %s', (e as Error).message)
        })
    }

    /**
     * Resets quick pick's state to default and stops any current execution
     */
    public async reset(): Promise<void> {
        // Promise is necessary to ensure that cancelExecutionFn() is called to completion before reset() completes.
        // Open to suggestions if you know a better way to do this.
        await new Promise<void>(resolve => {
            getLogger().debug('Resetting IteratingQuickPickController and cancelling any current execution')

            if (this.state.cancelExecutionFn) {
                this.state.cancelExecutionFn()
            }

            this.quickPick.items = []

            this.state = new IteratingQuickPickControllerState(this.populator.createPickIterator())

            resolve()
        })
    }

    /**
     * Shim function for picker.promptUser calls on pickers that use iteratingQuickPickControllers.
     * Wraps refresh functionality for this controller and otherwise passes through to a user-provided onDidTriggerButton function (from constructor)
     * @param button Provided by promptUser
     * @param resolve Provided by promptUser
     * @param reject Provided by promptUser
     */
    public async iteratingOnDidTriggerButton(
        button: vscode.QuickInputButton,
        resolve: (value: vscode.QuickPickItem[] | PromiseLike<vscode.QuickPickItem[] | undefined> | undefined) => void,
        reject: (reason?: any) => void
    ): Promise<vscode.QuickPickItem[] | undefined> {
        switch (button) {
            case this.refreshButton:
                await this.reset()
                this.startRequests()
                return undefined
            default:
                return this.onDidTriggerButton ? this.onDidTriggerButton(button, resolve, reject) : undefined
        }
    }

    private async loadItems(): Promise<void> {
        // unpause the loader (if it was paused previously by a selection)
        this.state.isRunning = true

        // use a while loop so we have greater control over the iterator.
        // breaking out of a for..of loop for an iterator will automatically set the iterator to `done`
        // manual iteration means that we can use the same iterator no matter how many times we call loadItems()
        while (!this.state.isDone && this.state.isRunning) {
            this.quickPick.busy = true

            try {
                const loadedItems = await Promise.race([
                    // promise representing AWS call logic
                    new Promise<IteratorResult<vscode.QuickPickItem[], any>>((resolve, reject) => {
                        this.state.iterator
                            .next()
                            .then(newItems => {
                                getLogger().debug(`Returning a payload of size: ${newItems.value.length}`)
                                resolve(newItems)
                            })
                            .catch(e => {
                                // append error node
                                // give quickpick item an error message
                                // we should not blow away the existing items, they should still be viable
                                const err = e as Error
                                getLogger().error('Error while loading items for IteratingQuickPickController:', err)
                                resolve({
                                    value: [
                                        {
                                            ...IteratingQuickPickController.ERROR_ITEM,
                                            detail: err.message,
                                        },
                                    ],
                                    done: true,
                                })
                            })
                    }),
                    // externally-rejectable promise for cancelling an execution
                    new Promise<IteratorResult<vscode.QuickPickItem[], any>>((resolve, reject) => {
                        this.state.cancelExecutionFn = () => {
                            getLogger().debug('Cancelling execution...')
                            reject()
                        }
                    }),
                ])
                if (!loadedItems) {
                    this.state.isDone = true
                    break
                }
                // TODO: Is there a way to append to this ReadOnlyArray so it doesn't constantly pop focus back to the top?
                this.quickPick.items = this.quickPick.items.concat(loadedItems.value)
                if (loadedItems.done) {
                    // no items in response
                    if (this.quickPick.items.length === 0) {
                        this.quickPick.items = [IteratingQuickPickController.NO_ITEMS_ITEM]
                    }

                    this.state.isDone = true
                    break
                }
            } catch (rejectedCallback) {
                getLogger().debug('Cancelled loop execution')
                break
            } finally {
                // reset cancellation function
                if (this.state.cancelExecutionFn) {
                    this.state.cancelExecutionFn = undefined
                }
            }
        }

        // disable loading bar
        this.quickPick.busy = false
    }
}

class IteratingQuickPickControllerState {
    public cancelExecutionFn: undefined | (() => void) = undefined
    public isDone?: boolean
    public isRunning?: boolean
    public constructor(public iterator: AsyncIterator<vscode.QuickPickItem[]>) {}
}
