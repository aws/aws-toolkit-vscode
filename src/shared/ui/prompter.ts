/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isWizardControl, WizardControl } from '../wizards/wizard'
import * as input from './input'
import * as picker from './picker'

type QuickPickDataType<T> = T | WizardControl

type QuickPickResult<T> = T | T[] | WizardControl | undefined
type InputBoxResult = string | WizardControl | undefined
type QuickInputResult<T> = QuickPickResult<T> | InputBoxResult

type QuickPickData<T> = QuickPickDataType<T> | (() => Promise<QuickPickDataType<T>>)
export type DataQuickPickItem<T> = vscode.QuickPickItem & 
    (T extends string ? { data?: QuickPickData<string> } : { data: QuickPickData<T> })
export type DataQuickPick<T> = vscode.QuickPick<DataQuickPickItem<T>>

export type ButtonBinds = Map<vscode.QuickInputButton, (resolve: any, reject: any) => void>

function isInputBoxOptions(arg1: any, arg2: any): arg1 is input.ExtendedInputBoxOptions {
    return arg2 === undefined && !(arg1 instanceof Promise)
}

const PROMPTER_DEFAULT_OPTIONS: input.ExtendedInputBoxOptions & picker.ExtendedQuickPickOptions = {
    ignoreFocusOut: true,
}

function createAsyncPrompter<T>(items: Promise<DataQuickPickItem<T>[] | undefined>, options?: picker.ExtendedQuickPickOptions): Prompter<T> {
    const asyncPicker = picker.createQuickPick<T>({ options: {...PROMPTER_DEFAULT_OPTIONS, ...options } })
    asyncPicker.busy = true
    asyncPicker.enabled = false

    items.then(items => {
        if (items === undefined) {
            vscode.commands.executeCommand('workbench.action.quickInputBack') // make hide instead?
        } else {
            asyncPicker.items = items
            asyncPicker.busy = false
            asyncPicker.enabled = true
        }
    }).catch(err => {
        // TODO: this is an unhandled exception so we should log it appropriately
        asyncPicker.hide()
    })

    return new QuickPickPrompter<T>(asyncPicker, options?.buttonBinds)
}

// Builder pattern instead of this?
export function createPrompter(options: input.ExtendedInputBoxOptions): Prompter<string>
export function createPrompter<T>(items: DataQuickPickItem<T>[], options?: picker.ExtendedQuickPickOptions): Prompter<T>
export function createPrompter<T>(items: Promise<DataQuickPickItem<T>[] | undefined>, options?: picker.ExtendedQuickPickOptions): Prompter<T>
export function createPrompter<T>(
    arg1: DataQuickPickItem<T>[] | Promise<DataQuickPickItem<T>[] | undefined> | input.ExtendedInputBoxOptions, 
    arg2?: picker.ExtendedQuickPickOptions
): Prompter<T> | Prompter<string> {
    if (Array.isArray(arg1)) {
        return new QuickPickPrompter(picker.createQuickPick(
            { items: arg1, options: {...PROMPTER_DEFAULT_OPTIONS, ...arg2 } }), 
            arg2?.buttonBinds
        )
    }

    if (isInputBoxOptions(arg1, arg2)) {
        return new InputBoxPrompter(input.createInputBox(
            { options: {...PROMPTER_DEFAULT_OPTIONS, ...arg1 } }), 
            arg1.buttonBinds
        )
    } 

    return createAsyncPrompter(arg1, arg2)
}

// TODO
export interface PrompterButton {
    readonly button: vscode.QuickInputButton, 
    readonly callback: (resolve: any, reject: any) => void
}

type AfterPrompt<T> = (result: QuickInputResult<T>) => Promise<QuickInputResult<T> | void>
export abstract class Prompter<T> {
    protected readonly buttonBinds: ButtonBinds = new Map()
    protected readonly afterCallbacks: AfterPrompt<T>[] = []

    constructor(private readonly input: vscode.InputBox | vscode.QuickPick<DataQuickPickItem<T>>) {}

    public get busy(): boolean { return this.input.busy }
    public get enabled(): boolean { return this.input.enabled }
    public get quickInput(): vscode.QuickInput { return this.input }

    public toggleInput(): void {
        this.input.enabled = !this.enabled
    }

    public setSteps(current: number, total: number): void {
        this.input.step = current
        this.input.totalSteps = total
    }

    public addButtonBinds(newBinds: ButtonBinds): void {
        newBinds.forEach((callback, button) => {
            if (!this.buttonBinds.has(button)) {
                this.input.buttons = [...this.input.buttons, button]
            }
            this.buttonBinds.set(button, callback)
        })
    } 

    public after(callback: AfterPrompt<T>): Prompter<T> {
        this.afterCallbacks.push(callback)
        return this
    }

    protected async applyAfterCallbacks(result: QuickInputResult<T>): Promise<QuickInputResult<T>> {
        for (const cb of this.afterCallbacks) {
            const transform = await cb(result)
            if (transform !== undefined) {
                result = transform
            }
        }
        return result
    }

    public abstract prompt(): Promise<QuickInputResult<T>>  
    public abstract setLastPicked(picked?: T | DataQuickPickItem<T> | DataQuickPickItem<T>[]): void
    public abstract getLastPicked(): T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined
}

export class QuickPickPrompter<T> extends Prompter<T> {
    private lastPicked?: DataQuickPickItem<T> | DataQuickPickItem<T>[]

    constructor(private readonly quickPick: vscode.QuickPick<DataQuickPickItem<T>>, buttonBinds?: ButtonBinds, private readonly transformUserInput?: (v?: string) => T) {
        super(quickPick)
        this.addButtonBinds(buttonBinds ?? new Map())
    }
    
    private isUserInput(picked: any): picked is DataQuickPickItem<T> {
        return picked !== undefined && !Array.isArray(picked) && picked.data === picker.CUSTOM_USER_INPUT
    }

    private async processChoices(choices: DataQuickPickItem<T>[] | undefined): Promise<QuickInputResult<T>> {
        const result = choices !== undefined 
            ? this.quickPick.canSelectMany !== true
                ? choices[0].data ?? choices[0].label : choices.map(choices => choices.data ?? choices.label)
            : undefined

        if (this.isUserInput(result)) {
            return this.transformUserInput ? this.transformUserInput(result.description) : undefined
        } else if (Array.isArray(result)) {
            result.forEach(element => {
                if (isWizardControl(element)) {
                    return element
                }
            })
            return await Promise.all(result.map(async f => f instanceof Function ? await f() : f)) as T[]
        } else if (result instanceof Function) {
            return await result()
        } else {
            return result
        }
    }

    public async prompt(): Promise<QuickInputResult<T>> {
        const choices = await picker.promptUser({
            picker: this.quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (this.buttonBinds !== undefined && this.buttonBinds.has(button)) {
                    this.buttonBinds.get(button)!(resolve, reject)
                }
            },
        })

        if (choices !== undefined) {
            this.lastPicked = choices
        }

        return super.applyAfterCallbacks(await this.processChoices(choices))
    }

    public setLastPicked(picked: DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined = this.lastPicked): void {
        if (picked === undefined) {
            return
        }

        this.quickPick.value = (this.isUserInput(picked) ? picked.description : undefined) ?? ''

        if (!this.isUserInput(picked)) {
            const pickedArray = Array.isArray(picked) ? picked : [picked]
            this.quickPick.activeItems = this.quickPick.items.filter(
                item => pickedArray.map(item => item.label).includes(item.label)
            )

            if (this.quickPick.activeItems.length === 0) {
                this.quickPick.activeItems = [this.quickPick.items[0]]
            }

            //if (this.quickPick.activeItems.length === 1) {
            //    this.quickPick.activeItems[0].description = localize('AWS.wizard.selectedPreviously', 'Selected Previously')
            //}
        }
    }

    public getLastPicked(): T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined {
        return this.lastPicked
    }
}

export class InputBoxPrompter extends Prompter<string> {
    constructor(private readonly inputBox: vscode.InputBox, buttonBinds?: ButtonBinds) {
        super(inputBox)
        this.addButtonBinds(buttonBinds ?? new Map())
    }

    public async prompt(): Promise<QuickInputResult<string>> {
        const result = await input.promptUser({
            inputBox: this.inputBox,
            onDidTriggerButton: (button, resolve, reject) => {
                if (this.buttonBinds !== undefined && this.buttonBinds.has(button)) {
                    this.buttonBinds.get(button)!(resolve, reject)
                }
            },
        })

        return this.applyAfterCallbacks(result)
    }

    public setLastPicked(picked: string): void {
        this.inputBox.value = picked
    }

    public getLastPicked(): string | undefined {
        return ''
    }
}