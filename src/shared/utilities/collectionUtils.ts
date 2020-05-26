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

// TODO: Move this to a function?
// TODO: Allow this to generate its own client?
export class IteratingAWSCall<TRequest, TResponse> {
    private isDone: boolean = false
    private nextToken: string | undefined = undefined

    /**
     * Wrap an AWS call in an iterating wrapper that handles the call's nextToken field.
     * @param awsCall Call to wrap an iterating call around. Remember to add `.bind(this)` the call (or use an arrow function) or else `this` will be bound incorrectly.
     * @param nextTokenNames The property representing the nextToken fields from the request and the response. Must be a property from the request/response types.
     */
    public constructor(
        private readonly awsCall: (request: TRequest) => Promise<TResponse>,
        private readonly nextTokenNames: {
            request: keyof TRequest
            response: keyof TResponse
        }
    ) {}

    /**
     * Generates an iterator from a request.
     * TODO: Make this uncallable once an iterator has started from this class since the nextToken is specific to the class and not the iterator itself (or retain state solely in the function)
     * @param request Request object to start the initial iteration off of.
     */
    public async *getIteratorForRequest(
        request: TRequest
    ): AsyncGenerator<TResponse, undefined, TResponse | undefined> {
        while (!this.isDone) {
            try {
                const response: TResponse = await this.awsCall({
                    ...request,
                    [this.nextTokenNames.request]: this.nextToken,
                })
                if (response[this.nextTokenNames.response]) {
                    this.nextToken = (response[this.nextTokenNames.response] as any) as string
                } else {
                    this.nextToken = undefined
                    this.isDone = true
                }

                yield response
            } catch (err) {
                return undefined
            }
        }
        return undefined
    }
}
