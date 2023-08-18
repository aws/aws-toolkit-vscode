/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection, toCollection } from './asyncCollection'
import { SharedProp, AccumulableKeys, Coalesce, isNonNullable } from './tsUtils'

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

export function toRecord<T, K extends PropertyKey>(keys: Iterable<K>, fn: (key: K) => T): { [P in K]: T } {
    const result = {} as Record<K, T>

    for (const key of keys) {
        result[key] = fn(key)
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

/**
 * Gets the first item matching predicate, or undefined.
 */
export async function findAsync<T>(
    sequence: Iterable<T>,
    predicate: (item: T) => Promise<boolean>
): Promise<T | undefined> {
    for (const item of sequence) {
        if (await predicate(item)) {
            return item
        }
    }
    return undefined
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
 * Nearly equivalent to {@link Object.assign} except that `undefined` values are ignored.
 *
 * Directly mutates {@link target}. The function signature should be read as assigning {@link data}
 * _into_ {@link target}.
 */
export function assign<T extends Record<any, any>, U extends Partial<T>>(data: T, target: U): asserts target is T & U {
    for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) {
            target[k as keyof U] = v
        }
    }
}

/** Recursively delete undefined key/value pairs */
export function stripUndefined<T extends Record<string, any>>(
    obj: T
): asserts obj is { [P in keyof T]-?: NonNullable<T[P]> } {
    Object.keys(obj).forEach(key => {
        if (obj[key] === undefined) {
            delete obj[key]
        } else if (typeof obj[key] === 'object') {
            stripUndefined(obj[key])
        }
    })
}

export function isAsyncIterable(obj: any): obj is AsyncIterable<unknown> {
    return obj && typeof obj === 'object' && typeof obj[Symbol.asyncIterator] === 'function'
}

/**
 * Converts a 'paged' API request to a collection of sequential API requests
 * based off a 'mark' (the paginated token field) and a `prop` which is an
 * Accumulable property on the response interface.
 *
 * Note: aws-sdk-js-v3 provides service-specific paginateXX() functions:
 * https://aws.amazon.com/blogs/developer/pagination-using-async-iterators-in-modular-aws-sdk-for-javascript/
 *
 * @param requester Asynchronous function to make the API requests with.
 * @param request Initial request to apply to the API calls.
 * @param mark Property name (ex: "nextToken") of the paginated token field shared by the input/output shapes.
 * @param prop Property name (ex: "items") of an "Accumulable" field in the output shape.
 * @returns An {@link AsyncCollection} resolving to the type described by the `prop` field
 */
export function pageableToCollection<
    TRequest,
    TResponse,
    TTokenProp extends SharedProp<TRequest, TResponse>,
    TTokenType extends TRequest[TTokenProp] & TResponse[TTokenProp],
    TResult extends AccumulableKeys<TResponse> = never
>(
    requester: (request: TRequest) => Promise<TResponse>,
    request: TRequest,
    mark: TTokenProp,
    prop?: TResult
): AsyncCollection<Coalesce<TResponse[TResult], TResponse>> {
    async function* gen() {
        do {
            const response: TResponse = await requester(request)
            const result = (prop ? response[prop] : response) as Coalesce<TResponse[TResult], TResponse>
            if (!response[mark]) {
                return result
            }
            yield result
            request[mark] = response[mark] as TTokenType
        } while (request[mark])
    }

    return toCollection(gen)
}

/**
 * Converts an iterable of promises into an unordered stream of values.
 *
 * The resulting stream will throw if any of the promises are rejected.
 */
export async function* toStream<T>(values: Iterable<T | Promise<T>>): AsyncGenerator<T, void> {
    const unresolved = new Map<number, Promise<{ index: number; data: T }>>()
    for (const val of values) {
        if (val instanceof Promise) {
            const index = unresolved.size
            unresolved.set(
                index,
                val.then(data => ({ index, data }))
            )
        } else {
            yield val
        }
    }

    while (unresolved.size > 0) {
        const { index, data } = await Promise.race(unresolved.values())
        unresolved.delete(index)
        yield data
    }
}

export function* partition<T>(iterable: Iterable<T>, size: number): Generator<T[]> {
    let batch = []
    for (const element of iterable) {
        batch.push(element)
        if (batch.length === size) {
            yield batch
            batch = []
        }
    }
    if (batch.length > 0) {
        yield batch
    }
}

interface IndexedResult<T, U> {
    readonly index: number
    readonly result: IteratorResult<T, U>
}

interface IterableState<T, U> {
    readonly iterator: AsyncIterator<T, U>
    pending?: Promise<IndexedResult<T, U>>
    completed?: boolean
}

class AsyncIterableCollection<T, U = undefined> {
    readonly #iterables: IterableState<T, U>[] = []

    public get completed(): boolean {
        return this.#iterables.every(s => s.completed)
    }

    /**
     * Adds an iterable, returning the associated index
     */
    public add(iterable: AsyncIterable<T>): number {
        const iterator = iterable[Symbol.asyncIterator]()

        return this.#iterables.push({ iterator }) - 1
    }

    /**
     * Gets the next result from all iterables.
     *
     * The index associated with the iterable is returned alongside the result.
     * Throws if no value is available. Check {@link completed} prior to calling this method.
     */
    public async next(): Promise<IndexedResult<T, U>> {
        const promises = this.#iterables.map((s, i) => this.getPending(s, i)).filter(isNonNullable)
        if (promises.length === 0) {
            throw new Error('Cannot get next element when all iterators have been consumed')
        }

        const val = await Promise.race(promises)
        this.#iterables[val.index].pending = undefined

        if (val.result.done) {
            this.#iterables[val.index].completed = true
        }

        return val
    }

    private getPending(state: IterableState<T, U>, index: number) {
        if (state.completed) {
            return
        } else if (state.pending) {
            return state.pending
        } else {
            const pending = state.iterator.next().then(result => ({ index, result }))
            state.pending = pending

            return pending
        }
    }
}

/**
 * Joins two async iterables into a single generator.
 *
 * Values from each iterable are yielded as soon as they resolve. The order of values is preserved with respect
 * to the source iterable but not necessarily other iterables. This can be imagined as popping off all elements
 * of two stacks randomly: elements from the same stack will be in order while elements from different stacks
 * can be in any order.
 */
export async function* join<T, U>(left: AsyncIterable<T>, right: AsyncIterable<U>): AsyncGenerator<T | U, void> {
    const iterables = new AsyncIterableCollection<T | U>()
    iterables.add(left)
    iterables.add(right)

    do {
        const next = await iterables.next()
        if (!next.result.done) {
            yield next.result.value
        }
    } while (!iterables.completed)
}

/**
 * Similar to {@link join} but can handle an async iterable of async iterables.
 */
export async function* joinAll<T>(iterable: AsyncIterable<AsyncIterable<T>>): AsyncGenerator<T, void> {
    const iterables = new AsyncIterableCollection<T | AsyncIterable<T>>()
    const mainIndex = iterables.add(iterable)

    do {
        const next = await iterables.next()
        if (next.result.done) {
            continue
        }
        if (next.index === mainIndex && isAsyncIterable(next.result.value)) {
            iterables.add(next.result.value)
        } else {
            yield next.result.value as T
        }
    } while (!iterables.completed)
}

export async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

export function intoCollection<T>(arr: T[]): AsyncCollection<T> {
    return toCollection(async function* () {
        yield* arr
    })
}

export function createCollectionFromPages<T>(...pages: T[]): AsyncCollection<T> {
    return toCollection(async function* () {
        for (let i = 0; i < pages.length - 1; i++) {
            yield pages[i]
        }

        return pages[pages.length - 1]
    })
}
