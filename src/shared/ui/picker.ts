/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { WIZARD_BACK } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { Prompter, PrompterButtons, PromptResult } from './prompter'
import { applySettings } from '../utilities/collectionUtils'

/** Additional options to configure the `QuickPick` beyond the standard API */
interface AdditionalQuickPickOptions<T=never> {
    title?: string
    value?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: PrompterButtons<T>
}

export type ExtendedQuickPickOptions<T> = 
    Omit<vscode.QuickPickOptions, 'buttons' | 'canPickMany'> & AdditionalQuickPickOptions<T>

export const DEFAULT_QUICKPICK_OPTIONS: vscode.QuickPickOptions = {
    ignoreFocusOut: true,
}

type QuickPickData<T> = PromptResult<T> | (() => Promise<PromptResult<T>>)
type LabelQuickPickItem<T> = vscode.QuickPickItem & { label: T }

/** 
 * Attaches additional information as `data` to a QuickPickItem. Alternatively, `data` can be a function that
 * returns a Promise, evaluated after the user selects the item. 
 */
export type DataQuickPickItem<T> = vscode.QuickPickItem & { data: QuickPickData<T> }
export type DataQuickPick<T> = 
    Omit<vscode.QuickPick<DataQuickPickItem<T>>, 'buttons'> & { buttons: PrompterButtons<T> }

const CUSTOM_USER_INPUT = Symbol()

/**
 * Creates a new QuickPick using special DataQuickPickItem interfaces. Information that should be returned when
 * the user selects an item should be placed in the `data` property of each item. If only the `label` is desired,
 * use `createLabelQuickPick` instead.
 * 
 * @param items An array or a Promise for items. 
 * @param options Customizes the QuickPick and QuickPickPrompter.
 * @returns A QuickPickPrompter. This can be used directly with the `prompt` method or can be fed into a Wizard.
 */
export function createQuickPick<T>(
    items: DataQuickPickItem<T>[] | Promise<DataQuickPickItem<T>[] | undefined>,
    options?: ExtendedQuickPickOptions<T>
): QuickPickPrompter<T> {
    const picker = vscode.window.createQuickPick<DataQuickPickItem<T>>() as DataQuickPick<T>
    options = { ...DEFAULT_QUICKPICK_OPTIONS, ...options }
    applySettings(picker, { ...DEFAULT_QUICKPICK_OPTIONS, ...options })

    const prompter = new QuickPickPrompter<T>(picker)

    if (items instanceof Promise) { 
        makePickerAysnc(picker, items)
    } else {
        picker.items = items
    }

    return prompter
}

/** Creates a QuickPick from normal QuickPickItems, using the `label` as the return value. */
export function createLabelQuickPick<T extends string>(
    items: LabelQuickPickItem<T>[] | Promise<LabelQuickPickItem<T>[] | undefined>,
    options?: ExtendedQuickPickOptions<T>
): QuickPickPrompter<T> {
    if (items instanceof Promise) {
        return createQuickPick(items.then(items =>
            items !== undefined 
                ? items.map(item => ({ ...item, data: item.label }))
                : undefined
        ), options)
    }
    return createQuickPick(items.map(item => ({ ...item, data: item.label })), options)
}

function makePickerAysnc<T>(
    picker: DataQuickPick<T>,
    items: Promise<DataQuickPickItem<T>[] | undefined>
): void {
    picker.busy = true
    picker.enabled = false

    items.then(items => {
        if (items === undefined) {
            picker.hide()
        } else {
            picker.items = items
            picker.busy = false
            picker.enabled = true
        }
    })
}

/** 
 * Sets up the QuickPick events. Reject is intentionally not used since errors should be handled through
 * control signals, not exceptions.
 */
function promptUser<T>(picker: DataQuickPick<T>): Promise<DataQuickPickItem<T>[] | undefined> {
    return new Promise<DataQuickPickItem<T>[] | undefined>(resolve => {
        picker.onDidAccept(() => resolve(Array.from(picker.selectedItems)))
        picker.onDidHide(() => resolve(undefined)) // change to exit
        picker.onDidTriggerButton(button => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve([{ label: '', data: WIZARD_BACK }])
            } else {
                (button as QuickInputButton<T>).onClick(arg => resolve([{ label: '', data: arg }]))
            }
        })
        picker.show()
    })
}

// TODO: make a `MultiQuickPickPrompter`
export class QuickPickPrompter<T> extends Prompter<T> {
    private lastPicked?: DataQuickPickItem<T>

    constructor(public readonly quickPick: DataQuickPick<T>) {
        super(quickPick)
    }
    
    private isUserInput(picked: any): picked is DataQuickPickItem<symbol> {
        return picked !== undefined && picked.data === CUSTOM_USER_INPUT
    }

    protected async promptUser(): Promise<PromptResult<T>> {
        const choices = await promptUser(this.quickPick)

        if (choices === undefined) {
            return choices
        }
        
        this.lastPicked = choices[0]
        const result = choices[0].data

        return (result instanceof Function) ? await result() : result
    }

    public setLastResponse(picked: DataQuickPickItem<T> | undefined = this.lastPicked): void {
        if (picked === undefined) {
            return
        }

        this.quickPick.value = (this.isUserInput(picked) ? picked.description : undefined) ?? ''

        if (!this.isUserInput(picked)) {
            this.quickPick.activeItems = this.quickPick.items.filter(item => item.label === picked.label)
        }

        if (this.quickPick.activeItems.length === 0) {
            this.quickPick.activeItems = [this.quickPick.items[0]]
        }
    }

    /**
     * Allows the prompter to accept the QuickPick filter box as input, shown as a QuickPickItem.
     * 
     * @param label The label of the QuickPickItem that shows the user's input
     * @param transform Required when the expected type is not a string, transforming the input into the expected type or a control signal.
     */
    public allowCustomUserInput(label: string, transform: (v?: string) => PromptResult<T>): void {
        // TODO: this function would not work for pickers that update the items after making the call
        // need to make rework some of the control flow if we want that functionality
        const picker = this.quickPick as DataQuickPick<T | symbol>
        const items = picker.items 
        let lastUserInput: string | undefined

        function update(value?: string) {
            lastUserInput = value
            if (value !== undefined) {
                const customUserInputItem = {
                    label,
                    description: value,
                    alwaysShow: true,
                    data: CUSTOM_USER_INPUT,
                } as DataQuickPickItem<T | symbol>
    
                picker.items = [customUserInputItem, ...(items ?? [])]
            } else {
                picker.items = items ?? []
            }
        }

        picker.onDidChangeValue(update)

        this.after(async selection => {
            if ((selection as (T | typeof CUSTOM_USER_INPUT)) === CUSTOM_USER_INPUT) {
                return transform !== undefined ? transform(lastUserInput) : selection
            } 
            return selection
        })
    }

    public getLastResponse(): T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined {
        return this.lastPicked
    }
}