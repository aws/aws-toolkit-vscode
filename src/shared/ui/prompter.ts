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

export abstract class Prompter<T> {
    protected readonly afterCallbacks: Transform<PromptResult<T>>[] = []

    constructor(private readonly input: DataQuickInput<T>) {}
    public setSteps(current: number, total: number): void {
        this.input.step = current
        this.input.totalSteps = total
    }

    public after(callback: Transform<PromptResult<T>>): Prompter<T> {
        this.afterCallbacks.push(callback)
        return this
    }

    protected async applyAfterCallbacks(result: PromptResult<T>): Promise<PromptResult<T>> {
        for (const cb of this.afterCallbacks) {
            const transform = await cb(result)
            if (transform !== undefined) {
                result = transform
            }
        }
        return result
    }

    public abstract prompt(): Promise<PromptResult<T>>  
    public abstract setLastResponse(picked?: T | DataQuickPickItem<T> | DataQuickPickItem<T>[]): void
    public abstract getLastResponse(): T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined
}