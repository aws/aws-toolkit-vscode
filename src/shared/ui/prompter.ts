/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { isValidResponse, WizardControl } from '../wizards/wizard'

export type QuickPickDataType<T> = T | WizardControl | undefined

export type MultiQuickPickResult<T> = T[] | WizardControl | undefined
export type PromptResult<T> = T | WizardControl | undefined

type Transform<T, R = T> = (result: T) => R

/**
 * A generic dialog object that encapsulates the presentation and transformation of user
 * responses to arbitrary GUIs.
 */
export abstract class Prompter<T> {
    private disposed = false
    protected transforms: Transform<T, any>[] = []

    constructor() {}

    /** The total number of steps that occured during the prompt */
    public get totalSteps(): number {
        return 1
    }

    /** Implementing classes should use the argument to show the user what they last selected (if applicable) */
    public abstract get lastResponse(): any
    /** Implementing classes should return the user's response _before_ transforming into into type T */
    public abstract set lastResponse(response: any)

    /** Type-helper, allows Prompters to be mapped to different shapes */
    public transform<R>(callback: Transform<T, R>): Prompter<R> {
        this.transforms.push(callback)
        return this as unknown as Prompter<R>
    }

    /** Applies transformations to the user response in the order in which they were added */
    private applyTransforms(result: PromptResult<T>): PromptResult<T> {
        for (const cb of this.transforms) {
            if (!isValidResponse(result)) {
                return result
            }
            const transform: T | undefined = cb(result)
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
        return this.applyTransforms(await this.promptUser())
    }

    protected abstract promptUser(): Promise<PromptResult<T>>
    public abstract setSteps(current: number, total: number): void
}
