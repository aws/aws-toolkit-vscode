/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import './asyncIteratorShim'
import * as hasher from 'node-object-hash'

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

export async function first<T>(sequence: AsyncIterable<T>): Promise<T | undefined> {
    const head = await take(sequence, 1)

    return head.length > 0 ? head[0] : undefined
}

export async function take<T>(sequence: AsyncIterable<T>, count: number): Promise<T[]> {
    if (count <= 0) {
        return []
    }

    const result: T[] = []

    for await (const item of sequence) {
        result.push(item)

        if (result.length >= count) {
            break
        }
    }

    return result
}

export interface getPaginatedAwsCallIterParams<TRequest, TResponse> {
    awsCall: (request: TRequest) => Promise<TResponse>
    nextTokenNames: {
        request: keyof TRequest
        response: keyof TResponse
    }
    request: TRequest
}

/**
 * Generates an iterator representing a paginated AWS call from a request and an AWS SDK call
 * Each next() call will make a new request with the previous request's nextToken.
 * @param params Iterator params
 */
export async function* getPaginatedAwsCallIter<TRequest, TResponse>(
    params: getPaginatedAwsCallIterParams<TRequest, TResponse>
): AsyncIterator<TResponse> {
    let nextToken: string | undefined = undefined

    while (true) {
        const response: TResponse = await params.awsCall({
            ...params.request,
            [params.nextTokenNames.request]: nextToken,
        })
        if (response[params.nextTokenNames.response]) {
            nextToken = response[params.nextTokenNames.response] as any as string
        } else {
            // done; returns last response with { done: true }
            return response
        }

        yield response
    }
}

/**
 * Represents an iterator that tranforms another iterator into an array of QuickPickItems.
 * Additionally, has a reset functionality to reset the iterator to its initial state.
 * @template TIteratorOutput Iterator output value type
 * @template TTransformerOutput Transformer output value type
 */
export class IteratorTransformer<TIteratorOutput, TTransformerOutput> {
    /**
     * @param iteratorFactory Function that returns an iterator, with all default state values set. E.g. `collectionUtils.getPaginatedAwsCallIter`
     * @param transform Function which transforms a response from the iterator into an array of `vscode.QuickPickItem`s.
     */
    public constructor(
        private readonly iteratorFactory: () => AsyncIterator<TIteratorOutput>,
        private readonly transform: (response: TIteratorOutput) => TTransformerOutput[]
    ) {}

    /**
     * Generates an iterator which returns an array of formatted QuickPickItems on `.next()`
     */
    public async *createPickIterator(): AsyncIterator<TTransformerOutput[]> {
        const iterator = this.iteratorFactory()
        while (true) {
            const nextResult = await iterator.next()
            const transformedResult = this.transform(nextResult.value)

            // return (instead of yield) marks final value as done
            if (nextResult.done) {
                return transformedResult
            }

            yield transformedResult
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
export function pushIf<T>(arr: T[], condition: boolean, ...elements: T[]): T[] {
    if (condition) {
        arr.push(...elements)
    }
    return arr
}

/**
 * Applies `settings` to a base object. The shared properties between the settings and the object must have the
 * same types, enforced by the TypeScript compiler. Will only apply primitives. Silently ignores objects.
 */
export function applyPrimitives<T1 extends Record<string, any>, T2 extends T1>(obj: T2, settings: T1): void {
    const clone = Object.assign({}, settings)
    Object.keys(clone)
        .filter(key => typeof clone[key] === 'object' || typeof clone[key] === 'undefined')
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

export function entries<T extends Record<PropertyKey, any>>(obj: T): [keyof T, T[keyof T]][] {
    return Object.entries(obj)
}

export function isAsyncIterable<T = unknown>(obj: any): obj is AsyncIterable<T> {
    return typeof obj === 'object' && typeof obj[Symbol.for('asyncIterator')] === 'function'
}

export type Cacheable = (...args: any[]) => NonNullable<any>

type UnboxAsyncIterable<T> = T extends AsyncIterable<infer U> ? U : T

/**
 * A wrapped function that can cache both synchronous and asynchronous return types.
 *
 * Pending promises are returned as-is, while resolved promises are 'unboxed' into their promised type.
 */
export interface CachedFunction<
    F extends Cacheable,
    Unbox extends boolean = true,
    ResolveIterable extends boolean = true
> {
    (...args: Parameters<F>): Unbox extends true
        ? ReturnType<F> extends Promise<infer Inner>
            ? ReturnType<F> | Inner
            : ReturnType<F>
        : ResolveIterable extends true
        ? UnboxAsyncIterable<ReturnType<F>>
        : ReturnType<F>
    /** Clears all keys that were cached. */
    clearCache(this: void): void
    /** Replaces the most-recently cached value with a new value. */
    supplantLast(this: void, result: ReturnType<F> extends Promise<infer Inner> ? Inner : ReturnType<F>): void
}
export interface CachedFunctionOptions<F extends Cacheable> {
    /** Cache to use for storing results. If not provided, an empty dictionary will be created instead. */
    cache?: { [key: string]: ReturnType<F> }
    /**
     * Automatically 'unboxes' Promises into their resolved value. Useful if you want to execute code _immediately_ if
     * the value is already known rather than waiting for the event loop to process already queued microtasks.
     * (default: true)
     */
    unboxPromises?: boolean
    /**
     * Caches the result of an {@link AsyncIterable} rather than the iterable itself. (default: true)
     */
    resolveAsyncIterables?: boolean
    /** Extra options passed to the hashing library. See {@link hasher.HasherOptions HasherOptions}. */
    hashOptions?: hasher.HasherOptions
}

function cacheAsyncIterable<T extends AsyncIterable<R>, R = any>(iterable: T, cache: R[]) {
    return async function* () {
        yield* cache
        for await (const newVal of iterable) {
            cache.push(newVal)
            yield newVal
        }
    }
}

/**
 * Creates a cached function, handling both synchronous and asychronous operations. Instruments the function with
 * additional methods for manipulating the internal cache.
 *
 * This is very similar to Python's [functools.cache](https://docs.python.org/3/library/functools.html#functools.cache)
 * but with a JavaScript spin on it. Mainly useful for long-running asychronous calls. Callers can also implement
 * {@link hasher.Hashable Hashable} for improved performance with custom objects.
 *
 * Note that computing the argument hash can be a fairly expensive operation for non-primitive argument types.
 * Use this function wisely!
 *
 * @param func Function to wrap
 * @param options {@link CachedFunctionOptions}
 * @returns The {@link CachedFunction wrapped function}
 */

export function createCachedFunction<F extends (...args: any[]) => Promise<any>>(
    func: F,
    options?: CachedFunctionOptions<F> & { unboxPromises?: true }
): CachedFunction<F, true>
export function createCachedFunction<F extends Cacheable>(
    func: F,
    options?: CachedFunctionOptions<F>
): CachedFunction<F, false>
export function createCachedFunction<F extends Cacheable>(
    func: F,
    options: CachedFunctionOptions<F> = {}
): CachedFunction<F> {
    const cache = options.cache ?? {}
    const keys = new Set<string>()
    let lastKey: string

    const wrapped = (...args: Parameters<F>) => {
        const key = hasher(options.hashOptions).hash(args)
        lastKey = key

        if (cache[key] !== undefined) {
            keys.add(key)
            return cache[key]
        }

        const resolved = func(...args)
        cache[key] = resolved
        keys.add(key)

        if ((options.unboxPromises ?? true) && resolved instanceof Promise) {
            return resolved.then(result => {
                cache[key] = result
                return result
            })
        }

        if ((options.resolveAsyncIterables ?? true) && isAsyncIterable<any>(resolved)) {
            const gen = cacheAsyncIterable(resolved, [] as any[])
            Object.defineProperty(cache, key, {
                get: () => gen(),
                configurable: true,
            })
            return gen()
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
        cache[lastKey] = result
    }

    return Object.assign(wrapped, { clearCache, supplantLast })
}

export type PartialCachedFunction<
    F extends Cacheable,
    Unbox extends boolean = true,
    ResolveIterable extends boolean = true,
    Cache extends Record<string, any> = { [key: string]: ReturnType<F> }
> = (cache: Cache) => CachedFunction<() => ReturnType<F>, Unbox, ResolveIterable>

/**
 * ~Partial~ Full application of the cached function with deferred cache binding.
 * TODO: either rename this or set-up the types correctly to represent partial application.
 */
export function partialCached<F extends Cacheable>(func: F, ...args: Parameters<F>): PartialCachedFunction<F> {
    return cache => {
        const cachedFunc = createCachedFunction(func, { cache })
        const { clearCache, supplantLast } = cachedFunc
        const partial = () => cachedFunc(...args)
        return Object.assign(partial, { clearCache, supplantLast })
    }
}
