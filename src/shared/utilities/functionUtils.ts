/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates a function that always returns a 'shared' Promise.
 *
 * This is essentially a 'debounce' or unkeyed 'lock' for async functions.
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

    return () => (val ??= fn())
}
