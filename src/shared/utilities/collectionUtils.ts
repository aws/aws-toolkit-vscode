/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import './asyncIteratorShim'

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
        if (!!key) {
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
        if (!!key) {
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
            nextToken = (response[params.nextTokenNames.response] as any) as string
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
