/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isWizardControl, WizardControl } from '../wizards/wizard'
import { QuickInputButton } from './buttons'
import { DataQuickPickItem } from './picker'

export type QuickPickDataType<T> = T | WizardControl | undefined

export type MultiQuickPickResult<T> = T[] | WizardControl | undefined 
export type PromptResult<T> = T | WizardControl | undefined
type WizardButton<T> = QuickInputButton<T | WizardControl> | QuickInputButton<void>
export type PrompterButtons<T=WizardControl> = readonly WizardButton<T>[]

export function isValidResponse<T>(response: PromptResult<T>): response is T {
    return response !== undefined && !isWizardControl(response)
}

type Transform<T> = (result: T) => Promise<T | void>
type DataQuickInput<T> = vscode.QuickInput & { buttons: PrompterButtons<T> }

// Store buttons here
// The first type 'T' is the output expected output of the Prompter (T or undefined),
// the second type 'U' is the underlying data structure (e.g. QuickPickItem)
// Rename 'QuickInputPrompter'??
export abstract class Prompter<T, U extends PromptResult<T> = PromptResult<T>> {
    private onReadyForInputEventEmitter = new vscode.EventEmitter<void>()
    public onReadyForInput: vscode.Event<void> = this.onReadyForInputEventEmitter.event
    protected readonly afterCallbacks: Transform<U>[] = []

    constructor(private readonly input: DataQuickInput<T>) {}

    private fireIfReady(): void {
        if (this.input.enabled && !this.input.busy) {
            this.onReadyForInputEventEmitter.fire()
        }
    }

    public show(): void {
        this.input.show()
        this.fireIfReady()
    }

    public get busy(): boolean { return this.input.busy }
    public set busy(busy: boolean) { 
        this.input.busy = busy
        this.fireIfReady()
    }

    public get enabled(): boolean { return this.input.enabled }
    public set enabled(enabled: boolean) { 
        this.input.enabled = enabled
        this.fireIfReady()
    }

    public get quickInput(): DataQuickInput<T> { return this.input }
    
    public setSteps(current: number, total: number): void {
        this.input.step = current
        this.input.totalSteps = total
    }

    public after(callback: Transform<U>): Prompter<T, U> {
        this.afterCallbacks.push(callback)
        return this
    }

    protected async applyAfterCallbacks(result: U): Promise<U> {
        for (const cb of this.afterCallbacks) {
            const transform = await cb(result)
            if (transform !== undefined) {
                result = transform
            }
        }
        return result
    }

    public abstract prompt(): Promise<U>  
    public abstract setLastResponse(picked?: U | T | DataQuickPickItem<T> | DataQuickPickItem<T>[]): void
    public abstract getLastResponse(): U | T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined
}