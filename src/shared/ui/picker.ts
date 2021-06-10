/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { WizardControl, WIZARD_BACK } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { Prompter, PrompterButtons, PromptResult } from './prompter'

/**
 * Options to configure the behavior of the quick pick UI.
 * Generally used to accommodate features not provided through vscode.QuickPickOptions
 */
export interface AdditionalQuickPickOptions<T=never> {
    title?: string
    value?: string
    step?: number
    placeholder?: string
    totalSteps?: number
    buttons?: PrompterButtons<T>
}

export type ExtendedQuickPickOptions<T> = Omit<vscode.QuickPickOptions, 'buttons' | 'canPickMany'> & AdditionalQuickPickOptions<T>

export const DEFAULT_QUICKPICK_OPTIONS: vscode.QuickPickOptions = {
    ignoreFocusOut: true,
}

function applySettings<T1, T2 extends T1>(obj: T2, settings: T1): void {
    Object.assign(obj, settings)
}

export type QuickPickResult<T> = T | WizardControl | undefined

export type DataQuickPick<T> = Omit<vscode.QuickPick<DataQuickPickItem<T>>, 'buttons'> & { buttons: PrompterButtons<T> }
export type DataQuickPickItem<T> = vscode.QuickPickItem & { data: QuickPickData<T> }
export type LabelQuickPickItem<T extends string> = vscode.QuickPickItem & { label: T, data?: QuickPickData<T> }

const CUSTOM_USER_INPUT = Symbol()
type QuickPickData<T> = QuickPickResult<T> | (() => Promise<QuickPickResult<T>>)
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
export function createQuickPick<T>(
    items: DataQuickPickItem<T>[] | Promise<DataQuickPickItem<T>[] | undefined>,
    options?: ExtendedQuickPickOptions<T>
): QuickPickPrompter<T> {
    const picker = vscode.window.createQuickPick<DataQuickPickItem<T>>() as DataQuickPick<T>
    options = { ...DEFAULT_QUICKPICK_OPTIONS, ...options }
    applySettings(picker, { ...DEFAULT_QUICKPICK_OPTIONS, ...options })

    const prompter = new QuickPickPrompter<T>(picker)

    if (items instanceof Promise) { 
        makeQuickPickPrompterAsync(picker, items)
    } else {
        picker.items = items
    }

    return prompter
}

/**
 * Creates QuickPick just to select from a label
 */
export function createLabelQuickPick<T extends string>(
    items: LabelQuickPickItem<T>[] | Promise<LabelQuickPickItem<T>[] | undefined>,
    options?: ExtendedQuickPickOptions<T>
): QuickPickPrompter<T> {
    if (items instanceof Promise) {
        return createQuickPick(items.then(items =>
            items !== undefined 
                ? items.map(item => ({ ...item, data: item.label }) as DataQuickPickItem<T>)
                : undefined
        ), options)
    }
    return createQuickPick(items.map(item => ({ ...item, data: item.label }) as DataQuickPickItem<T>), options)
}

/*
export function createMultiQuickPick<T>(
    items: DataQuickPickItem<T>[] | Promise<DataQuickPickItem<T>[] | undefined>, 
    options?: ExtendedQuickPickOptions<T>
): MultiQuickPickPrompter<T> {
    const picker = { ...vscode.window.createQuickPick<DataQuickPickItem<T>>(), buttons: [] }

    if (options) {
        applySettings(picker, options as vscode.QuickPickOptions)
    }

    const prompter = new MultiQuickPickPrompter<T>(picker)

    if (items instanceof Promise) { 
        makeQuickPickPrompterAsync(prompter, items)
    }

    return prompter
}
*/

/**
 * Quick helper function for asynchronous quick pick items
 */
function makeQuickPickPrompterAsync<T>(
    picker: DataQuickPick<T>, // | MultiQuickPickPrompter<T>, 
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
    }).catch(err => {
        // TODO: this is an unhandled exception so we should log it appropriately
        picker.hide()
    })
}

function promptUser<T>(picker: DataQuickPick<T>): Promise<DataQuickPickItem<T>[] | undefined> {
    return new Promise<DataQuickPickItem<T>[] | undefined>((resolve, reject) => {
        picker.onDidAccept(() => resolve(Array.from(picker.selectedItems)))
        picker.onDidHide(() => resolve(undefined)) // change to exit
        picker.onDidTriggerButton(button => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve([{ label: '', data: WIZARD_BACK }])
            } else {
                (button as QuickInputButton<T>).onClick(arg => resolve([{ label: '', data: arg }]), reject)
            }
        })
        picker.show()
    })

}

export class QuickPickPrompter<T> extends Prompter<T> {
    private lastPicked?: DataQuickPickItem<T>

    constructor(public readonly quickPick: DataQuickPick<T>) {
        super(quickPick)
    }
    
    private isUserInput(picked: any): picked is DataQuickPickItem<symbol> {
        return picked !== undefined && picked.data === CUSTOM_USER_INPUT
    }

    public async prompt(): Promise<QuickPickResult<T>> {
        const choices = await promptUser(this.quickPick)

        if (choices === undefined) {
            return choices
        }
        
        this.lastPicked = choices[0]
        const result = choices[0].data

        return super.applyAfterCallbacks(((result instanceof Function) ? await result() : result) )
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

    public allowUserInput(label: string, transform: (v?: string) => PromptResult<T>): void {
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

/*
export class MultiQuickPickPrompter<T, U extends Array<T> = Array<T>> extends Prompter<U> {
    private lastPicked?: DataQuickPickItem<T>[]

    constructor(private readonly quickPick: DataQuickPick<T>) {
        super(quickPick)
    }

    public setLastResponse(picked: DataQuickPickItem<T>[] | undefined = this.lastPicked): void {
        if (picked === undefined) {
            return
        }

        this.quickPick.activeItems = this.quickPick.items.filter(item => picked.map(it => it.label).includes(item.label))

        if (this.quickPick.activeItems.length === 0) {
            this.quickPick.activeItems = []
        }
    }

    public async prompt(): Promise<PromptResult<U>> {
        const choices = await promptUser({
            picker: this.quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                button.onClick(arg => resolve([{ label: '', data: arg }]), reject)
            },
        })

        if (choices === undefined) {
            return choices
        }

        this.lastPicked = choices

        const result = choices.map(choices => choices.data)

        // Any control signal in the choices will be collapsed down into a single return value
        result.forEach(element => {
            if (isWizardControl(element)) {
                return element
            }
        })

        return await Promise.all(result.map(async f => f instanceof Function ? await f() : f)) as U
    }

    public getLastResponse(): DataQuickPickItem<T>[] | undefined {
        return this.lastPicked
    }
}
*/
