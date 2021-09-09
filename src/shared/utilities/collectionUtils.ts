/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import './asyncIteratorShim'
import { AccumulatableKeys, NeverCoalesce, SharedProp } from './tsUtils'

export function union<T>(a: Iterable<T>, b: Iterable<T>): Set<T> {
    const result = new Set<T>()

    for (const item of a) {
        result.add(item)
    }

    for (const item of b) {
        result.add(item)
    }

    return result
}

export function intersection<T>(sequence1: Iterable<T>, sequence2: Iterable<T>): Set<T> {
    const set2 = new Set(sequence2)

    return new Set(filter(sequence1, item => set2.has(item)))
}

export function difference<T>(sequence1: Iterable<T>, sequence2: Iterable<T>): Set<T> {
    const set2 = new Set(sequence2)

    return new Set(filter(sequence1, item => !set2.has(item)))
}

export function complement<T>(sequence1: Iterable<T>, sequence2: Iterable<T>): Set<T> {
    const set1 = new Set(sequence1)

    return new Set(filter(sequence2, item => !set1.has(item)))
}

export async function toArrayAsync<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = []

    for await (const item of items) {
        result.push(item)
    }

    return result
}

export function toMap<TKey, TValue>(
    items: Iterable<TValue>,
    keySelector: (item: TValue) => TKey | undefined
): Map<TKey, TValue> {
    const result = new Map<TKey, TValue>()

    for (const item of items) {
        const key = keySelector(item)
        if (key) {
            if (result.has(key)) {
                throw new Error(`Conflict: Multiple items have the key '${key}'`)
            }

            result.set(key, item)
        }
    }

    return result
}

export async function toMapAsync<TKey, TValue>(
    items: AsyncIterable<TValue>,
    keySelector: (item: TValue) => TKey | undefined
): Promise<Map<TKey, TValue>> {
    const result = new Map<TKey, TValue>()

    for await (const item of items) {
        const key = keySelector(item)
        if (key) {
            if (result.has(key)) {
                throw new Error(`Conflict: Multiple items have the key '${key}'`)
            }

            result.set(key, item)
        }
    }

    return result
}

export function updateInPlace<TKey, TValue>(
    target: Map<TKey, TValue>,
    keys: Iterable<TKey>,
    update: (key: TKey) => void,
    create: (key: TKey) => TValue
) {
    const keySet = new Set(keys)

    for (const key of difference(target.keys(), keySet)) {
        target.delete(key)
    }

    for (const key of target.keys()) {
        update(key)
    }

    for (const key of complement(target.keys(), keySet)) {
        target.set(key, create(key))
    }
}

export function* map<TIn, TOut>(sequence: Iterable<TIn>, selector: (item: TIn) => TOut): IterableIterator<TOut> {
    for (const item of sequence) {
        yield selector(item)
    }
}

export function filter<T>(sequence: Iterable<T>, condition: (item: T) => boolean): T[] {
    const result: T[] = []

    for (const item of sequence) {
        if (condition(item)) {
            result.push(item)
        }
    }

    return result
}

export async function* filterAsync<T>(
    sequence: Iterable<T>,
    condition: (item: T) => Promise<boolean>
): AsyncIterable<T> {
    for (const item of sequence) {
        if (await condition(item)) {
            yield item
        }
    }
}

/**
 * Push if condition is true, useful for adding CLI arguments, and avoiding this kind of situation:
 * if (x && y) {
 *     arr.push(item2)
 *     if(z) {
 *         arr.push(item)
 *     }
 * }
 * @param arr The array to push to
 * @param condition conditional that determines if we will push to the array
 * @param elements The additional items to append to the array
 */
export function pushIf<T>(arr: T[], condition: boolean, ...elements: T[]) {
    if (condition) {
        arr.push(...elements)
    }
}

/**
 * Applies `settings` to a base object. The shared properties between the settings and the object must have the
 * same types, enforced by the TypeScript compiler. Will only apply primitives. Silently ignores objects.
 */
export function applyPrimitives<T1 extends Record<string, any>, T2 extends T1>(obj: T2, settings: T1): void {
    const clone = Object.assign({}, settings)
    Object.keys(clone)
        .filter(key => typeof clone[key] === 'object')
        .forEach(key => delete clone[key])

    Object.assign(obj, clone)
}

/** Recursively delete undefined key/value pairs */
export function stripUndefined(obj: any): void {
    Object.keys(obj).forEach(key => {
        if (obj[key] === undefined) {
            delete obj[key]
        } else if (typeof obj[key] === 'object') {
            stripUndefined(obj[key])
        }
    })
}

/** Initial request may be optional, should always return a Promise */
type OptionalRequestFn<T, U> = ((request: T) => Promise<U>) | ((request?: T) => Promise<U>)
/** Either 'unbox' an Iterable value or leave it as-is if it's not an Iterable */
type SafeUnboxIterable<T> = T extends Iterable<infer U> ? U : T

/**
 * Converts a 'paged' API request to a collection of sequential API requests
 * based off a 'mark' (the paginated token field) and a `prop` which is an
 * accumulatable property on the response interface.
 *
 * @param requester Asynchronous function to make the API requests with
 * @param request Initial request to apply to the API calls
 * @param mark A property name of the paginated token field shared by the input/output shapes
 * @param prop A property name of an 'accumulatable' field in the output shape
 * @returns An {@link AsyncCollection} resolving to the type described by the `prop` field
 */
export function pageableToCollection<
    TRequest,
    TResponse,
    TTokenProp extends SharedProp<TRequest, TResponse>,
    TResult extends AccumulatableKeys<TResponse>,
    TTokenType extends TRequest[TTokenProp] & TResponse[TTokenProp]
>(
    requester: OptionalRequestFn<TRequest, TResponse>,
    request: TRequest,
    mark: TTokenProp,
    prop: TResult
): AsyncCollection<TResponse[TResult]> {
    async function* gen() {
        do {
            const response = await requester(request)
            yield response[prop]
            request[mark] = response[mark] as TTokenType
        } while (request[mark])
    }

    return toCollection(gen)
}

async function* mapAsyncIterable<T, U>(iterable: AsyncIterable<T>, mapfn: (item: T) => U) {
    for await (const item of iterable) {
        yield mapfn(item)
    }
}

function isIterable<T>(obj: any): obj is Iterable<T> {
    return obj !== undefined && typeof obj[Symbol.iterator] === 'function'
}

async function* flatten<T, U extends SafeUnboxIterable<T>>(iterable: AsyncIterable<T>) {
    for await (const item of iterable) {
        if (isIterable<U>(item)) {
            yield* item
        } else {
            yield item as U
        }
    }
}

async function promise<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = []

    for await (const item of iterable) {
        result.push(item)
    }

    return result
}

async function* takeFrom<T>(iterable: AsyncIterable<T>, count: number) {
    for await (const item of iterable) {
        if (--count < 0) {
            return
        }
        yield item
    }
}

type AsyncPredicate<T, U extends T> = ((item: T) => item is U) | ((item: T) => Promise<boolean> | boolean)

async function* filterAsyncIterable<T, U extends T>(iterable: AsyncIterable<T>, predicate: AsyncPredicate<T, U>) {
    for await (const item of iterable) {
        if (predicate(item)) {
            yield item
        }
    }
}

function addToMap<T, U extends string>(map: Map<U, T>, selector: KeySelector<T, U> | StringProperty<T>, item: T) {
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
    const result = new Map<NeverCoalesce<U, T[K]>, T>()

    for await (const item of iterable) {
        addToMap(result, selector, item)
    }

    return result
}

/**
 * Converts an AsyncGenerator function to an {@link AsyncCollection}
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
export function toCollection<T>(generator: () => AsyncGenerator<T>): AsyncCollection<T> {
    const iterable: AsyncIterable<T> = {
        [Symbol.asyncIterator]: () => generator(),
    }

    return Object.assign(iterable, {
        flatten: () => toCollection<SafeUnboxIterable<T>>(() => flatten(iterable)),
        filter: <U extends T>(predicate: AsyncPredicate<T, U>) =>
            toCollection<U>(() => filterAsyncIterable(iterable, predicate)),
        map: <U>(fn: (item: T) => U) => toCollection<U>(() => mapAsyncIterable(iterable, fn)),
        take: (count: number) => toCollection(() => takeFrom(iterable, count)),
        promise: () => promise(iterable),
        toMap: <U extends string = never, K extends StringProperty<T> = never>(selector: KeySelector<T, U> | K) =>
            asyncIterableToMap(iterable, selector),
    })
}

/**
 * High-level abstraction over async generator functions of the form `async function*` {@link AsyncGenerator}
 */
export interface AsyncCollection<T> extends AsyncIterable<T> {
    /** Flattens the collection 1-level deep */
    flatten(): AsyncCollection<SafeUnboxIterable<T>>
    /** Applies a mapping transform to the output generator */
    map<U>(fn: (obj: T) => U): AsyncCollection<U>
    /** Filters out results. This changes how many elements will be consumed by `take`. */
    filter<U extends T>(predicate: AsyncPredicate<T, U>): AsyncCollection<U>
    /** Uses only the first 'count' number of values returned by the generator. */
    take(count: number): AsyncCollection<T>
    /** Converts the collection to a Promise, resolving to an array of all values returned by the generator. */
    promise(): Promise<T[]>
    /** Converts the collection to a Map, using either a property of the item or a function to select keys. */
    toMap<K extends StringProperty<T>, U extends string = never>(
        selector: KeySelector<T, U> | K
    ): Promise<Map<NeverCoalesce<U, T[K]>, T>>
}
