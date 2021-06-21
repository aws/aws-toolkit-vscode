/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { WIZARD_BACK } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { Prompter, PrompterButtons, PromptResult } from './prompter'
import { applyPrimitives } from '../utilities/collectionUtils'

/** Additional options to configure the `QuickPick` beyond the standard API */
interface AdditionalQuickPickOptions<T=never> {
    title?: string
    value?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: PrompterButtons<T>
    customInputSettings?: {
        label: string
        transform: (v: string) => PromptResult<T>
    }
}

// TODO: add 'canPickMany' option back in then make a 'MultiQuickPickPrompter'
export type ExtendedQuickPickOptions<T> = 
    Omit<vscode.QuickPickOptions, 'buttons' | 'canPickMany' | 'placeHolder'> & AdditionalQuickPickOptions<T>

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
    applyPrimitives(picker, { ...DEFAULT_QUICKPICK_OPTIONS, ...options })

    const prompter = options.customInputSettings !== undefined 
        ? new CustomQuickPickPrompter<T>(picker, options.customInputSettings.label, options.customInputSettings.transform)
        : new QuickPickPrompter<T>(picker)

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
        picker.onDidAccept(() => picker.selectedItems.length > 0 && resolve(Array.from(picker.selectedItems)))
        picker.onDidHide(() => resolve(undefined)) // change to exit
        picker.onDidTriggerButton(button => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve([{ label: '', data: WIZARD_BACK }])
            } else if ((button as QuickInputButton<T>).onClick !== undefined) {
                const response = (button as QuickInputButton<T>).onClick!()
                if (response !== undefined) {
                    resolve([{ label: '', data: response }])
                }
            }
        })
        picker.show()
    }).finally(() => picker.hide())
}

// TODO: make a `MultiQuickPickPrompter` (very simple to make)
export class QuickPickPrompter<T> extends Prompter<T> {
    protected lastPicked?: DataQuickPickItem<T>

    constructor(public readonly quickPick: DataQuickPick<T>) {
        super()
    }

    public setSteps(current: number, total: number): void {
        this.quickPick.step = current
        this.quickPick.totalSteps = total
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

        this.quickPick.activeItems = this.quickPick.items.filter(item => item.label === picked.label)

        if (this.quickPick.activeItems.length === 0) {
            this.quickPick.activeItems = [this.quickPick.items[0]]
        }
    }

    public getLastResponse(): T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined {
        return this.lastPicked
    }
}

/**
 * Allows the prompter to accept the QuickPick filter box as input, shown as a QuickPickItem.
 * Note: untested with any picker that can refresh items (haven't needed this functionality yet)
 * 
 * @param label The label of the QuickPickItem that shows the user's input
 * @param transform Required when the expected type is not a string, transforming the input into the expected type or a control signal.
 */
export class CustomQuickPickPrompter<T> extends QuickPickPrompter<T> {
    
    constructor(quickPick: DataQuickPick<T>, label: string, transform: (v: string) => PromptResult<T>) {
        super(quickPick)
        this.addCustomInput(label, transform)
    }

    private addCustomInput(label: string, transform: (v: string) => PromptResult<T>): void {
        const picker = this.quickPick as DataQuickPick<T | symbol>
        let items: DataQuickPickItem<T | symbol>[] | undefined = [...picker.items as DataQuickPickItem<T | symbol>[]]
        let lastUserInput: string | undefined

        // TODO: clean this code up
        function update(value: string = '') {
            if ((items === undefined || items.length === 0) && picker.busy === false) {
                items = [...picker.items as DataQuickPickItem<T | symbol>[]]
            } else if (picker.busy === true) {
                items = undefined
            }

            lastUserInput = value
            if (value !== '') {
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
        picker.onDidChangeActive(() => picker.busy === true && update())

        this.after(async selection => {
            if ((selection as (T | typeof CUSTOM_USER_INPUT)) === CUSTOM_USER_INPUT) {
                return transform !== undefined ? transform(lastUserInput!) : selection
            } 
            return selection
        })
    }

    private isUserInput(picked: any): picked is DataQuickPickItem<symbol> {
        return picked !== undefined && picked.data === CUSTOM_USER_INPUT
    }

    public setLastResponse(picked: DataQuickPickItem<T> | undefined = this.lastPicked): void {
        super.setLastResponse(picked)

        if (this.isUserInput(picked)) {
            this.quickPick.value = picked.description ?? ''
        }
    }
}
