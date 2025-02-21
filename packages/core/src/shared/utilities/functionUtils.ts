/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Timeout } from './timeoutUtils'

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
 * Special-case of `memoize`: creates a function that is executed only once.
 */
export function once<T>(fn: () => T): () => T {
    let val: T
    let ran = false

    return () => (ran ? val : ((val = fn()), (ran = true), val))
}

/**
 * Special-case of `memoize`: creates a function that runs only if the args
 * changed versus the previous invocation.
 *
 * @note See note on {@link memoize}
 *
 * TODO: use lib?: https://github.com/anywhichway/nano-memoize
 */
export function onceChanged<T, U extends any[]>(fn: (...args: U) => T): (...args: U) => T {
    let val: T
    let ran = false
    let prevArgs = ''

    return (...args) =>
        ran && prevArgs === args.map(String).join(':')
            ? val
            : ((val = fn(...args)), (ran = true), (prevArgs = args.map(String).join(':')), val)
}

/**
 * Creates a new function that stores the result of a call for non-async functions.
 *
 * @note This uses an extremely simple mechanism for creating keys from parameters.
 * Objects are effectively treated as a single key, while primitive values will behave as
 * expected with a few very uncommon exceptions.
 *
 * TODO: use lib?: https://github.com/anywhichway/nano-memoize
 */
export function memoize<T, U extends any[]>(fn: (...args: U) => T): (...args: U) => T {
    const cache: { [key: string]: T | undefined } = {}

    return (...args) => (cache[args.map(String).join(':')] ??= fn(...args))
}

/**
 * Generalization of the {@link memoize} method that accepts async methods, and allows user to pass mapping from keys to args.
 * @param fn
 * @param key
 * @returns
 */
export function memoizeWith<T, U extends any[]>(
    fn: (...args: U) => T | Promise<T>,
    key: (...args: U) => string | Promise<string> = (...args: U) => args.map(String).join(':')
): (...args: U) => Promise<T> {
    const cache: { [key: string]: T } = {}
    return async (...args) => (cache[await key(...args)] ??= await fn(...args))
}

/**
 * Prevents a function from executing until {@link delay} milliseconds have passed
 * since the last invocation. Omitting {@link delay} will not execute the function for
 * a single event loop.
 *
 * Multiple calls made during the debounce window will receive references to the
 * same Promise similar to {@link shared}. The window will also be 'rolled', delaying
 * the execution by another {@link delay} milliseconds.
 *
 * This function prevents execution until {@link delay} milliseconds have passed
 * since the last invocation regardless of arguments. If this should be
 * argument dependent, look into {@link keyedDebounce}
 */
export function debounce<Input extends any[], Output>(
    cb: (...args: Input) => Output | Promise<Output>,
    delay: number = 0
): (...args: Input) => Promise<Output> {
    return cancellableDebounce(cb, delay).promise
}

/**
 *
 * Similar to {@link debounce}, but allows the function to be cancelled.
 */
export function cancellableDebounce<Input extends any[], Output>(
    cb: (...args: Input) => Output | Promise<Output>,
    delay: number = 0
): { promise: (...args: Input) => Promise<Output>; cancel: () => void } {
    let timeout: Timeout | undefined
    let promise: Promise<Output> | undefined

    const cancel = (): void => {
        if (timeout) {
            timeout.cancel()
            timeout = undefined
            promise = undefined
        }
    }

    return {
        promise: (...args: Input) => {
            timeout?.refresh()

            return (promise ??= new Promise<Output>((resolve, reject) => {
                timeout = new Timeout(delay)
                timeout.onCompletion(async () => {
                    timeout = promise = undefined
                    try {
                        resolve(await cb(...args))
                    } catch (err) {
                        reject(err)
                    }
                })
            }))
        },
        cancel: cancel,
    }
}

/**
 *
 * Similar to {@link debounce}, but uses a key to determine if the function should be called yet rather than a timeout connected to the function itself.
 */
export function keyedDebounce<T, U extends any[], K extends string = string>(
    fn: (key: K, ...args: U) => Promise<T>
): typeof fn {
    const pending = new Map<K, Promise<T>>()

    return (key, ...args) => {
        if (pending.has(key)) {
            return pending.get(key)!
        }

        const promise = fn(key, ...args).finally(() => pending.delete(key))
        pending.set(key, promise)

        return promise
    }
}
