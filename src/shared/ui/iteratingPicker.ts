/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getLogger } from '../logger'
import { IteratorTransformer } from '../utilities/collectionUtils'


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
        this.quickPick.buttons = [...this.quickPick.buttons, IteratingQuickPickController.REFRESH_BUTTON]
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
        this.loadItems()
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
            case IteratingQuickPickController.REFRESH_BUTTON:
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