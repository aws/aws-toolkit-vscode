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

/** Checks if the user response is valid (i.e. not undefined and not a control signal) */
export function isValidResponse<T>(response: PromptResult<T>): response is T {
    return response !== undefined && !isWizardControl(response)
}

type Transform<T> = (result: T) => Promise<T | void>
type DataQuickInput<T> = vscode.QuickInput & { buttons: PrompterButtons<T> }

/**
 * A generic dialog object that encapsulates the presentation and transformation of user
 * responses to arbitrary GUIs.
 */
export abstract class Prompter<T> {
    protected readonly afterCallbacks: Transform<PromptResult<T>>[] = []

    constructor(private readonly input: DataQuickInput<T>) {}

    public setSteps(current: number, total: number): void {
        this.input.step = current
        this.input.totalSteps = total
    }

    /** Adds a hook that is called after the user responds */
    public after(callback: Transform<PromptResult<T>>): Prompter<T> {
        this.afterCallbacks.push(callback)
        return this
    }

    /** Applies the 'after' hooks to the user response in the order in which they were added */
    private async applyAfterCallbacks(result: PromptResult<T>): Promise<PromptResult<T>> {
        for (const cb of this.afterCallbacks) {
            const transform = await cb(result)
            if (transform !== undefined) {
                result = transform
            }
        }
        return result
    }

    /** 
     * Opens a dialog for the user to respond to.
     * @returns The user-response, undefined, or a special control-signal used in Wizards.
     */
    public async prompt(): Promise<PromptResult<T>> {
        return this.applyAfterCallbacks(await this.promptUser())
    }

    protected abstract promptUser(): Promise<PromptResult<T>>
    // TODO: remove DataQuickPickItem<T> | DataQuickPickItem<T>[] from these types
    /** Implementing classes should use the argument to show the user what they last selected */
    public abstract setLastResponse(picked?: T | DataQuickPickItem<T> | DataQuickPickItem<T>[]): void
    /** Will not be needed if doing the above TODO */
    public abstract getLastResponse(): T | DataQuickPickItem<T> | DataQuickPickItem<T>[] | undefined
}