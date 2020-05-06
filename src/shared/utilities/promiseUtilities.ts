/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AsyncLock from 'async-lock'

const lock = new AsyncLock()

/**
 * Allows callers to use the same promise instead of starting a new one if it is currently running
 */
export class PromiseSharer {
    private static readonly LOCK_PROMISE_REUSE: string = 'lock.promise.reuse'
    private static readonly PROMISE_CACHE: { [key: string]: Promise<void> | undefined } = {}

    /**
     * Allows callers to retrieve the same promise back if requested multiple times over the duration of a promise
     * @param promiseName used to assess there is a promise to share
     * @param promiseGenerator actual promise to run. Caller is responsible for providing the same name/generator pair
     */
    public static async getExistingPromiseOrCreate(
        promiseName: string,
        promiseGenerator: () => Promise<void>
    ): Promise<void> {
        // TODO : Come up with a way to prevent using promiseName with an unrelated promise
        let promise: Promise<void>

        await lock.acquire(PromiseSharer.LOCK_PROMISE_REUSE, async () => {
            if (!PromiseSharer.PROMISE_CACHE[promiseName]) {
                PromiseSharer.PROMISE_CACHE[promiseName] = PromiseSharer.createPromise(promiseName, promiseGenerator)
            }

            promise = PromiseSharer.PROMISE_CACHE[promiseName]!
        })

        return promise!
    }

    private static async createPromise(promiseName: string, promiseGenerator: () => Promise<void>): Promise<void> {
        await promiseGenerator()

        await lock.acquire(PromiseSharer.LOCK_PROMISE_REUSE, async () => {
            PromiseSharer.PROMISE_CACHE[promiseName] = undefined
        })
    }
}

/**
 * Copied from src/vs/base/common/async.ts
 */
export function isThenable<T>(obj: any): obj is Promise<T> {
    return obj && typeof (<Promise<any>>obj).then === 'function'
}
