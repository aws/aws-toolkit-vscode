/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidResponse, StepEstimator, WizardControl } from '../wizards/wizard'

export type QuickPickDataType<T> = T | WizardControl | undefined

export type MultiQuickPickResult<T> = T[] | WizardControl | undefined
export type PromptResult<T> = T | WizardControl | undefined

export type Transform<T, R = T> = (result: T) => R

/**
 * A generic abstraction of 'prompt' UIs. Returns the user's input by calling the {@link Prompter.prompt prompt}
 * method. Can apply a series of deferred transformation callbacks to the input via {@link Prompter.transform transform}.
 */
export abstract class Prompter<T> {
    private disposed = false
    private pending?: ReturnType<typeof this.prompt>
    protected transforms: Transform<T, any>[] = []

    constructor() {}

    /** The total number of steps that occured during the prompt */
    public get totalSteps(): number {
        return 1
    }

    // TODO: add this to have a standard title across prompts
    // public abstract set title(title: string)

    /** Implementing classes should use this to show the user what they previously selected (if applicable). */
    public abstract get recentItem(): any
    /** Implementing classes should return the user's response _before_ transforming into into type T. */
    public abstract set recentItem(response: any)

    // TODO: we need the inverse transform to recover inputs across flows
    /** Type-helper, allows Prompters to be mapped to different shapes */
    public transform<R>(callback: Transform<T, R>): Prompter<R> {
        this.transforms.push(callback)
        return this as unknown as Prompter<R>
    }

    /** Applies transformations to the user response in the order in which they were added */
    protected applyTransforms(result: PromptResult<T>): PromptResult<T> {
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
            throw new Error('Cannot call "prompt" after the prompt is complete')
        }

        return (this.pending ??= this.promptUser()
            .then(r => this.applyTransforms(r))
            .finally(() => {
                this.disposed = true
            }))
    }

    /** Sets a 'step estimator' function used to predict how many steps are remaining in a given flow */
    public abstract setStepEstimator(estimator: StepEstimator<T>): void
    protected abstract promptUser(): Promise<PromptResult<T>>
    public abstract setSteps(current: number, total: number): void
}
