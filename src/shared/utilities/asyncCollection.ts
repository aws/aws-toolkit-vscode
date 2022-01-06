/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NeverCoalesce } from './tsUtils'

/**
 * High-level abstraction over async generator functions of the form `async function*` {@link AsyncGenerator}
 */
export interface AsyncCollection<T> extends AsyncIterable<T> {
    /** Flattens the collection 1-level deep */
    flatten(): AsyncCollection<SafeUnboxIterable<T>>
    /** Applies a mapping transform to the output generator */
    map<U>(fn: (obj: T) => U): AsyncCollection<U>
    /** Filters out results which will _not_ be passed on to further transformations. */
    filter<U extends T>(predicate: AsyncPredicate<T, U>): AsyncCollection<U>
    /** Uses only the first 'count' number of values returned by the generator. */
    take(count: number): AsyncCollection<T>
    /** Converts the collection to a Promise, resolving to an array of all values returned by the generator. */
    promise(): Promise<T[]>
    /** Converts the collection to a Map, using either a property of the item or a function to select keys. */
    toMap<K extends StringProperty<T>, U extends string = never>(
        selector: KeySelector<T, U> | K
    ): Promise<Map<NeverCoalesce<U, T[K]>, T>>
    iterator(): AsyncIterator<T, T | void>
}

/**
 * Converts an AsyncIterable to an {@link AsyncCollection}
 *
 * Uses closures to capture generator functions after each transformation. Generator functions are not called
 * until a 'final' operation is taken by either:
 *  * Iterating over them using `for await (...)`
 *  * Iterating over them using `.next()`
 *  * Calling one of the conversion functions `toMap` or `promise`
 *
 * Collections are *immutable* in the sense that any transformation will not consume the underlying generator
 * function. That is, any 'final' operation uses its own contextually bound generator function separate from
 * any predecessor collections.
 */
export function toCollection<T>(generator: () => AsyncGenerator<T, T | undefined | void>): AsyncCollection<T> {
    async function* unboxIter() {
        const last = yield* generator()
        if (last !== undefined) {
            yield last
        }
    }

    const iterable: AsyncIterable<T> = {
        [Symbol.asyncIterator]: unboxIter,
    }

    return Object.assign(iterable, {
        flatten: () => toCollection<SafeUnboxIterable<T>>(() => delegateGenerator(generator(), flatten)),
        filter: <U extends T>(predicate: AsyncPredicate<T, U>) =>
            toCollection<U>(() => filterGenerator<T, U>(generator(), predicate)),
        map: <U>(fn: (item: T) => U) => toCollection<U>(() => mapGenerator(generator(), fn)),
        take: (count: number) => toCollection(() => delegateGenerator(generator(), takeFrom(count))),
        promise: () => promise(iterable),
        toMap: <U extends string = never, K extends StringProperty<T> = never>(selector: KeySelector<T, U> | K) =>
            asyncIterableToMap(iterable, selector),
        iterator: generator,
    })
}

async function* mapGenerator<T, U, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    fn: (item: T | R) => U
): AsyncGenerator<U, U | undefined> {
    while (true) {
        const { value, done } = await generator.next()
        if (done) {
            return value !== undefined ? (fn(value) as Awaited<U>) : undefined
        }
        if (value !== undefined) {
            yield fn(value)
        }
    }
}

async function* filterGenerator<T, U extends T, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    predicate: AsyncPredicate<T | R, U>
): AsyncGenerator<U, U | undefined> {
    while (true) {
        const { value, done } = await generator.next()
        if (value === undefined || !predicate(value)) {
            if (done) {
                break
            }
            continue
        }
        if (done) {
            return value as Awaited<U>
        }
        yield value
    }
}

async function* delegateGenerator<T, U, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    fn: (item: T | R, ret: () => void) => AsyncGenerator<U, void>
): AsyncGenerator<U, U | undefined> {
    while (true) {
        let last: U | undefined
        const { value, done } = await generator.next()
        if (value !== undefined) {
            const delegate = fn(value, generator.return.bind(generator))
            while (true) {
                const sub = await delegate.next()
                if (sub.done) {
                    break
                }
                last = sub.value
                if (!done) {
                    yield last
                }
            }
        }
        if (done) {
            return last as Awaited<U> | undefined
        }
    }
}

async function* flatten<T, U extends SafeUnboxIterable<T>>(item: T) {
    if (isIterable<U>(item)) {
        yield* item
    } else {
        yield item as U
    }
}

function takeFrom<T>(count: number) {
    return async function* (item: T, ret: () => void) {
        if (--count < 0) {
            return ret()
        }
        yield item
    }
}

/** Either 'unbox' an Iterable value or leave it as-is if it's not an Iterable */
type SafeUnboxIterable<T> = T extends Iterable<infer U> ? U : T

function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj !== undefined && typeof obj[Symbol.iterator] === 'function'
}

async function promise<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = []

    for await (const item of iterable) {
        result.push(item)
    }

    return result
}

type AsyncPredicate<T, U extends T> = ((item: T) => item is U) | ((item: T) => Promise<boolean> | boolean)

function addToMap<T, U extends string>(map: Map<string, T>, selector: KeySelector<T, U> | StringProperty<T>, item: T) {
    const key = typeof selector === 'function' ? selector(item) : item[selector]
    if (key) {
        if (map.has(key as keyof typeof map['keys'])) {
            throw new Error(`Duplicate key found when converting AsyncIterable to map: ${key}`)
        }

        map.set(key as keyof typeof map['keys'], item)
    }
}

// Type 'U' is constrained to be either a key of 'T' or a string returned by a function parsing 'T'
type KeySelector<T, U extends string> = (item: T) => U | undefined
type StringProperty<T> = { [P in keyof T]: T[P] extends string ? P : never }[keyof T]

// TODO: apply this to different iterables and replace the old 'map' code
async function asyncIterableToMap<T, K extends StringProperty<T>, U extends string = never>(
    iterable: AsyncIterable<T>,
    selector: KeySelector<T, U> | K
): Promise<Map<NeverCoalesce<U, T[K]>, T>> {
    const result = new Map<NeverCoalesce<U, T[K] & string>, T>()

    for await (const item of iterable) {
        addToMap(result, selector, item)
    }

    return result
}
