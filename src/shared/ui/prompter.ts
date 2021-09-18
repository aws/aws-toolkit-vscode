/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { isValidResponse, StateWithCache, StepEstimator, WizardControl } from '../wizards/wizard'

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
    protected transforms: Transform<T, any>[] = []

    constructor() {}

    /** The total number of steps that occured during the prompt */
    public get totalSteps(): number {
        return 1
    }

    // TODO: add this to have a standard title across prompts
    // public abstract set title(title: string)

    /** Implementing classes should use the argument to show the user what they last selected (if applicable) */
    public abstract get lastResponse(): any
    /** Implementing classes should return the user's response _before_ transforming into into type T */
    public abstract set lastResponse(response: any)

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
            throw new Error('Cannot call "prompt" multiple times')
        }
        this.disposed = true
        return this.applyTransforms(await this.promptUser())
    }

    /** Sets a 'step estimator' function used to predict how many steps are remaining in a given flow */
    public abstract setStepEstimator(estimator: StepEstimator<T>): void
    protected abstract promptUser(): Promise<PromptResult<T>>
    public abstract setSteps(current: number, total: number): void
}

export interface CachedPrompter<T, TState extends Record<string, unknown>> {
    (state: StateWithCache<TState, T>): Prompter<T>
}

type Cacheable = (...args: (string | number | boolean | undefined)[]) => NonNullable<any>

/**
 * A wrapped function that can cache both synchronous and asynchronous return types.
 *
 * Pending promises are returned as-is, while resolved promises are 'unboxed' into their promised type.
 */
export interface CachedFunction<F extends (...args: any) => any> {
    (...args: Parameters<F>): ReturnType<F> extends Promise<infer Inner> ? ReturnType<F> | Inner : ReturnType<F>
    clearCache(): void
    supplantLast(result: ReturnType<F> extends Promise<infer Inner> ? Inner : ReturnType<F>): void
}

// TODO: this currently just caches primitive arguments which is not very flexible
// there is a 'cache-object' library that could make sense here. we could just cache the entire
// argument list itself and not worry about types
function createCachedFunction<F extends Cacheable>(
    loader: F,
    cache: { [key: string]: ReturnType<F> } = {},
    keys: Set<string> = new Set()
): CachedFunction<F> {
    const wrapped = (...args: Parameters<F>) => {
        const key =
            args
                .map(arg => (arg ?? '').toString())
                .map(arg => (arg === '' ? arg : `${arg}${arg.length}`))
                .join() + '0' // Cannot index with an empty string

        if (cache[key] !== undefined) {
            return cache[key]
        }

        const resolved = loader(...args)
        cache[key] = resolved as any
        keys.add(key)

        if (resolved instanceof Promise) {
            return resolved.then(result => {
                cache[key] = result
                return result
            })
        }

        return resolved
    }

    const clearCache = () => {
        keys.forEach(key => delete cache[key])
        keys.clear()
    }

    const supplantLast = (result: ReturnType<F>) => {
        if (keys.size === 0) {
            throw new Error('Cannot evict an empty cache')
        }
        cache[[...keys.values()].pop()!] = result
    }

    return Object.assign(wrapped, { clearCache, supplantLast })
}

// Rebinds the Function function body to instead call the extended class method
const EXECUTE_CALLEE = 'return arguments.callee.call.apply(arguments.callee, arguments)'
/**
 * Convenience class that lightly wraps the creation of a Prompter with the loading of whatever resources
 * are required. The 'load' call is wrapped with a cache for automatic caching of its results.
 */
export abstract class CachedPrompter<
    T,
    TState extends Record<string, unknown> = Record<string, unknown>
> extends Function {
    private usedKeys = new Set<string>()
    protected transforms: Transform<T, any>[] = []

    public constructor() {
        super(EXECUTE_CALLEE)
    }

    public transform<R>(callback: Transform<T, R>): CachedPrompter<R, TState> {
        this.transforms.push(callback)
        return this as unknown as CachedPrompter<R, TState>
    }

    public call(state: StateWithCache<TState, T>): Prompter<T> {
        const cachedLoad = createCachedFunction(this.load.bind(this), state.stepCache, this.usedKeys)
        const prompter = this.createPrompter(cachedLoad, state)

        this.transforms.map(prompter.transform.bind(prompter))

        return prompter
    }

    protected abstract load(...args: any): any
    protected abstract createPrompter(loader: CachedFunction<any>, state: TState): Prompter<T>
}
