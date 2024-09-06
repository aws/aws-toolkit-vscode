/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coalesce } from './tsUtils'

/**
 * High-level abstraction over async generator functions of the form `async function*` {@link AsyncGenerator}
 */
export interface AsyncCollection<T> extends AsyncIterable<T> {
    /**
     * Flattens the collection 1-level deep.
     */
    flatten(): AsyncCollection<SafeUnboxIterable<T>>

    /**
     * Applies a mapping transform to the output generator.
     */
    map<U>(fn: (obj: T) => Promise<U> | U): AsyncCollection<U>

    /**
     * Filters out results which will _not_ be passed on to further transformations.
     */
    filter<U extends T>(predicate: (item: T) => item is U): AsyncCollection<U>
    filter<U extends T>(predicate: (item: T) => boolean): AsyncCollection<U>

    /**
     * Resolves the first element that matches the predicate.
     */
    find<U extends T>(predicate: (item: T) => item is U): Promise<U | undefined>
    find<U extends T>(predicate: (item: T) => boolean): Promise<U | undefined>

    /**
     * Catches all errors from the underlying iterable(s).
     *
     * Note that currently the contiuation behavior is highly dependent on the
     * underlying implementations. For example, a `for await` loop cannot be
     * continued if any of the resulting values are rejected.
     */
    catch<U>(handler: (error: unknown) => Promise<U> | U): AsyncCollection<T | U>

    /**
     * Uses only the first 'count' number of values returned by the generator.
     */
    limit(count: number): AsyncCollection<T>

    /**
     * Converts the collection to a Promise, resolving to an array of all values returned by the generator.
     */
    promise(): Promise<T[]>

    /**
     * Converts the collection to a Map, using either a property of the item or a function to select keys
     */
    toMap<K extends StringProperty<T>, U extends string = never>(
        selector: KeySelector<T, U> | K
    ): Promise<Map<Coalesce<U, T[K]>, T>>

    /**
     * Returns an iterator directly from the underlying generator, preserving values returned.
     */
    iterator(): AsyncIterator<T, T | void>
}

const asyncCollection = Symbol('asyncCollection')

/**
 * Converts an async generator function to an {@link AsyncCollection}
 *
 * Generation is "lazy", i.e. the generator is not called until a _resolving operation_:
 *  * Iterating using `for await (...)`
 *  * Iterating using `.next()`
 *  * Calling one of the conversion functions `toMap` or `promise`
 *
 * Collections are *immutable* in the sense that any transformation will not consume the underlying generator
 * function. That is, any "final" operation uses its own contextually bound generator function separate from
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
        [asyncCollection]: true,
        find: <U extends T>(predicate: Predicate<T, U>) => find(iterable, predicate),
        flatten: () => toCollection<SafeUnboxIterable<T>>(() => delegateGenerator(generator(), flatten)),
        filter: <U extends T>(predicate: Predicate<T, U>) =>
            toCollection<U>(() => filterGenerator<T, U>(generator(), predicate)),
        catch: <U>(fn: (error: unknown) => Promise<U> | U) =>
            toCollection<T | U>(() => catchGenerator(generator(), fn)),
        map: <U>(fn: (item: T) => Promise<U> | U) => toCollection<U>(() => mapGenerator(generator(), fn)),
        limit: (count: number) => toCollection(() => delegateGenerator(generator(), takeFrom(count))),
        promise: () => promise(iterable),
        toMap: <U extends string = never, K extends StringProperty<T> = never>(selector: KeySelector<T, U> | K) =>
            asyncIterableToMap(iterable, selector),
        iterator: generator,
    })
}

export function isAsyncCollection<T>(iterable: AsyncIterable<T>): iterable is AsyncCollection<T> {
    return asyncCollection in iterable
}

function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj !== undefined && typeof obj[Symbol.iterator] === 'function'
}

function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
    return obj && typeof obj === 'object' && typeof obj[Symbol.asyncIterator] === 'function'
}

async function* mapGenerator<T, U, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    fn: (item: T | R) => Promise<U> | U
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

type Predicate<T, U extends T> = (item: T) => item is U

async function* filterGenerator<T, U extends T, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    predicate: Predicate<T | R, U> | ((item: T | R) => boolean)
): AsyncGenerator<U, U | void> {
    while (true) {
        const { value, done } = await generator.next()

        if (done) {
            if (value !== undefined && predicate(value)) {
                return value as unknown as Awaited<U>
            }
            break
        }

        if (predicate(value)) {
            yield value
        }
    }
}

async function* delegateGenerator<T, U, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    fn: (item: T | R, ret: () => void) => AsyncGenerator<U, void>
): AsyncGenerator<U, U | undefined> {
    type LastValue = Readonly<{ isSet: false; value?: undefined } | { isSet: true; value: Awaited<U> }>
    let last: LastValue = { isSet: false }

    while (true) {
        const { value, done } = await generator.next()
        if (value !== undefined) {
            const delegate = fn(value, generator.return.bind(generator))
            while (true) {
                const sub = await delegate.next()
                if (sub.done) {
                    break
                }
                if (last.isSet) {
                    yield last.value
                }
                last = { isSet: true, value: sub.value as Awaited<U> }
            }
        }
        if (done) {
            break
        }
    }

    // The last value is buffered by one step to ensure it is returned here
    // rather than yielded in the while loops.
    return last.value
}

async function* flatten<T, U extends SafeUnboxIterable<T>>(item: T) {
    if (isIterable<U>(item) || isAsyncIterable<U>(item)) {
        yield* item
    } else {
        yield item as unknown as U
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

/**
 * Either 'unbox' an Iterable value or leave it as-is if it's not an Iterable
 */
type SafeUnboxIterable<T> = T extends Iterable<infer U> ? U : T extends AsyncIterable<infer U> ? U : T

async function promise<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = []

    for await (const item of iterable) {
        result.push(item)
    }

    return result
}

function addToMap<T, U extends string>(map: Map<string, T>, selector: KeySelector<T, U> | StringProperty<T>, item: T) {
    const key = typeof selector === 'function' ? selector(item) : item[selector]
    if (key) {
        if (map.has(key as keyof (typeof map)['keys'])) {
            throw new Error(`Duplicate key found when converting AsyncIterable to map: ${key}`)
        }

        map.set(key as keyof (typeof map)['keys'], item)
    }
}

// Type 'U' is constrained to be either a key of 'T' or a string returned by a function parsing 'T'
type KeySelector<T, U extends string> = (item: T) => U | undefined
type StringProperty<T> = { [P in keyof T]: T[P] extends string ? P : never }[keyof T]

// TODO: apply this to different iterables and replace the old 'map' code
async function asyncIterableToMap<T, K extends StringProperty<T>, U extends string = never>(
    iterable: AsyncIterable<T>,
    selector: KeySelector<T, U> | K
): Promise<Map<Coalesce<U, T[K]>, T>> {
    const result = new Map<Coalesce<U, T[K] & string>, T>()

    for await (const item of iterable) {
        addToMap(result, selector, item)
    }

    return result
}

async function find<T, U extends T>(iterable: AsyncIterable<T>, predicate: (item: T) => item is U) {
    for await (const item of iterable) {
        if (predicate(item)) {
            return item
        }
    }
}

async function* catchGenerator<T, U, R = T>(
    generator: AsyncGenerator<T, R | undefined | void>,
    fn: (error: unknown) => Promise<U> | U
): AsyncGenerator<T | U, R | U | undefined | void> {
    while (true) {
        try {
            const { value, done } = await generator.next()
            if (done) {
                return value
            }
            yield value
        } catch (err) {
            // Catching an error when the generator would normally
            // report 'done' means that the 'done' value would be
            // replaced by `undefined`.
            yield fn(err)
        }
    }
}
