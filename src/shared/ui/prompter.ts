/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { isValidResponse, WizardControl } from '../wizards/wizard'
import { QuickInputButton } from './buttons'

export type QuickPickDataType<T> = T | WizardControl | undefined

export type MultiQuickPickResult<T> = T[] | WizardControl | undefined 
export type PromptResult<T> = T | WizardControl | undefined
type WizardButton<T> = QuickInputButton<T | WizardControl> | QuickInputButton<void>
export type PrompterButtons<T=WizardControl> = readonly WizardButton<T>[]


type Transform<T, R=T> = (result: T) => R | void | Promise<R | void>

/**
 * A generic dialog object that encapsulates the presentation and transformation of user
 * responses to arbitrary GUIs.
 */
export abstract class Prompter<T> {
    private disposed = false
    protected afterCallbacks: Transform<T, any>[] = []

    constructor() {}

    public get totalSteps(): number { return 1 }

    /** Adds a hook that is called after the user responds */
    public after(callback: Transform<T, PromptResult<T>>): this {
        this.afterCallbacks.push(callback)
        return this
    }

    /** Type-helper, allows Prompters to be mapped to different shapes */
    public transform<R>(callback: Transform<T, R>): Prompter<R> {
        this.afterCallbacks.push(callback)
        return this as unknown as Prompter<R>
    }

    /** Applies the 'after' hooks to the user response in the order in which they were added */
    private async applyAfterCallbacks(result: PromptResult<T>): Promise<PromptResult<T>> {
        while (this.afterCallbacks.length > 0) {
            if (!isValidResponse(result)) {
                return result
            }
            const cb = this.afterCallbacks.shift()!
            const transform: T | undefined = await cb(result)
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
        if (this.disposed) {
            throw new Error('Cannot call "prompt" multiple times')
        }
        this.disposed = true
        return this.applyAfterCallbacks(await this.promptUser())
    }

    protected abstract promptUser(): Promise<PromptResult<T>>
    // TODO: remove DataQuickPickItem<T> | DataQuickPickItem<T>[] from these types
    /** Implementing classes should use the argument to show the user what they last selected */
    public abstract setLastResponse(picked?: any): void
    /** Will not be needed if doing the above TODO */
    public abstract getLastResponse(): any
    public abstract setSteps(current: number, total: number): void
}