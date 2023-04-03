/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

/**
 * Creates a function that always returns a 'shared' Promise.
 *
 * This is essentially a 'debounce' or unkeyed 'lock' for async functions.
 *
 * #### Example
 * ```ts
 * const foo = shared(async () => console.log('bar'))
 *
 * const f1 = foo() // 'bar' is printed
 * const f2 = foo() // nothing happens
 *
 * // Same event loop, equal by reference
 * assert.strictEqual(f1, f2)
 *
 * // The promise is not freed until the next event loop
 * await f1
 *
 * const f3 = foo() // 'bar' is printed
 * assert.notStrictEqual(f1, f3)
 * ```
 */
export function shared<T, U extends any[]>(fn: (...args: U) => Promise<T>): (...args: U) => Promise<T> {
    let p: Promise<T> | undefined

    return (...args) => (p ??= fn(...args).finally(() => (p = undefined)))
}

/**
 * Special-case of `memoize`. Ensures a function is executed only once.
 */
export function once<T>(fn: () => T): () => T {
    let val: T
    let ran = false

    return () => (ran ? val : ((val = fn()), (ran = true), val))
}

/**
 * Creates a new function that stores the result of a call.
 *
 * ### Important
 * This currently uses an extremely simple mechanism for creating keys from parameters.
 * Objects are effectively treated as a single key, while primitive values will behave as
 * expected with a few very uncommon exceptions.
 */
export function memoize<T, U extends any[]>(fn: (...args: U) => T): (...args: U) => T {
    const cache: { [key: string]: T | undefined } = {}

    return (...args) => (cache[args.map(String).join(':')] ??= fn(...args))
}

/**
 * Prevents a function from executing until {@link delay} milliseconds have passed
 * since the last invocation. Omitting {@link delay} will throttle the function for
 * a single event loop.
 *
 * Multiple calls made during the throttle window will receive references to the
 * same Promise similar to {@link shared}. The window will also be 'rolled', delaying
 * the execution by another {@link delay} milliseconds.
 */
export function throttle<T>(cb: () => T | Promise<T>, delay: number = 0): () => Promise<T> {
    let timer: NodeJS.Timeout | undefined
    let promise: Promise<T> | undefined

    return () => {
        timer?.refresh()

        return (promise ??= new Promise<T>((resolve, reject) => {
            timer = globals.clock.setTimeout(async () => {
                timer = promise = undefined
                try {
                    resolve(await cb())
                } catch (err) {
                    reject(err)
                }
            }, delay)
        }))
    }
}
