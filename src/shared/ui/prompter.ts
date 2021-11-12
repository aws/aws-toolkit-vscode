/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { WizardControl } from '../wizards/util'
import { isValidResponse, StepEstimator } from '../wizards/wizard'

export type PromptResult<T> = T | WizardControl
export type Transform<T, R> = (result: T) => R
export type ResultListener<T> = (result: Readonly<T>) => void

export interface PrompterConfiguration<T = any> {
    title?: string
    cache?: Record<string, any>
    steps?: { current: number; total: number }
    stepEstimator?: StepEstimator<T>
}

type SinglePromptConfiguration = Pick<PrompterConfiguration, 'title' | 'cache'>

/**
 * @experimental Currently not used. This will replace the base {@link Prompter} class.
 */
export interface IPrompter<T> {
    readonly totalSteps: number
    readonly id: string // might be useful?
    recentItem: any
    dipose(): void
    prompt(): Promise<T | undefined>
    promptControl(): Promise<PromptResult<T>>
    configure(config: PrompterConfiguration<T>): void
}

/**
 * A generic abstraction of 'prompt' UIs. Returns the user's input by calling the {@link Prompter.prompt prompt}
 * method. Can apply a series of deferred transformation callbacks to the input via {@link Prompter.transform transform}.
 */
export abstract class Prompter<T> {
    private prompting = false
    private disposed = false
    protected transforms: Transform<T, any>[] = []
    protected resultCallbacks: (Transform<T, any> | ResultListener<T>)[] = []

    /** The total number of steps that occured during the prompt */
    public get totalSteps(): number {
        return 1
    }

    /** Implementing classes should use this to show the user what they previously selected (if applicable). */
    public abstract get recentItem(): any
    /** Implementing classes should return the user's response _before_ transforming into into type T. */
    public abstract set recentItem(response: any)

    constructor() {}

    /**
     * Attaches a callback that is invoked after the user provides a valid response of type `T`.
     * The return value of the callback is ignored.
     */
    public onResponse(callback: (result: Readonly<T>) => void): this {
        this.resultCallbacks.push((result: Readonly<T>) => (callback(result), undefined))
        return this
    }

    // TODO: we need the inverse transform to recover inputs across flows
    /** Type-helper, allows Prompters to be mapped to different shapes */
    public transform<R>(callback: Transform<T, R>): Prompter<R> {
        this.transforms.push(callback)
        this.resultCallbacks.push(callback)
        return this as unknown as Prompter<R>
    }

    /** Applies transformations to the user response in the order in which they were added */
    protected applyTransforms(result: PromptResult<T>): PromptResult<T> {
        return this.executeCallbacks(result, this.transforms)
    }

    /** Applies callbacks in the order they were added. Invalid responses immediately return. */
    private executeCallbacks(
        result: PromptResult<T>,
        callbacks: (Transform<T, any> | ResultListener<T>)[]
    ): PromptResult<T> {
        for (const cb of callbacks) {
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

    public dispose(): void {
        this.disposed = true
    }

    private async promptOrThrow(config: PrompterConfiguration<T> = {}): Promise<PromptResult<T>> {
        if (this.prompting) {
            // May want to re-think this. Re-using a prompter can potentially be useful.
            throw new Error('Cannot prompt while already prompting')
        }
        if (this.disposed) {
            throw new Error('Cannot use prompter after it has been disposed')
        }
        this.prompting = true
        return this.executeCallbacks(await this.promptUser(config), this.resultCallbacks)
    }

    /**
     * Opens a dialog for the user to respond to.
     *
     * This is used for 'one-off' prompts not apart of a wizard flow.
     *
     * @returns The user-response or undefined.
     */
    public async prompt(config: SinglePromptConfiguration = {}): Promise<T | undefined> {
        const response = await this.promptOrThrow(config)
        return isValidResponse(response) ? response : undefined
    }

    /**
     * This is a special case of {@link Prompter.prompt} used in wizards.
     *
     * @returns The user-response or a control signal.
     */
    public async promptControl(config: PrompterConfiguration<T> = {}): Promise<PromptResult<T>> {
        return await this.promptOrThrow(config)
    }

    /** Derived classes should implement this to actually prompt the user. */
    protected abstract promptUser(config: PrompterConfiguration<T>): Promise<PromptResult<T>>
}
