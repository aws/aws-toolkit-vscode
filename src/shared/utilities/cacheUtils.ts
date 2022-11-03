/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import { dirname } from 'path'

// TODO(sijaden): further generalize this concept over async references (maybe create a library?)
// It's pretty clear that this interface (and VSC's `Memento`) reduce down to what is essentially
// a "pointer" with RW operations that return futures.

/**
 * A general, basic interface for a cache with key associativity.
 */
export interface KeyedCache<T, K = string> {
    /**
     * Attempts to read data stored at {@link key}.
     *
     * @param key Target key to read from.
     * @returns `T` on success, `undefined` if {@link key} doesn't exist.
     */
    load(key: K): Promise<T | undefined>

    /**
     * Writes {@link data} to {@link key}.
     *
     * @param key Target key to write to.
     * @param data Data to write.
     *
     * @returns `true` on success, `false` otherwise.
     */
    save(key: K, data: T): Promise<boolean>

    /**
     * Removes the data stored at {@link key}, if any.
     *
     * @param key Target key to clear.
     *
     * @returns `true` on success, `false` otherwise.
     */
    clear(key: K): Promise<boolean>
}

/**
 * Loads {@link key} from the cache.
 *
 * If the item does not exist, {@link fn} is executed. The result is saved using {@link key}.
 */
export async function loadOr<T, K>(cache: KeyedCache<T, K>, key: K, fn: () => Promise<T>): Promise<T> {
    const data = await cache.load(key)

    if (data === undefined) {
        const computed = await fn()
        await cache.save(key, computed)

        return computed
    }

    return data
}

/**
 * Maps a cache by transforming all inputs and outputs.
 *
 * Transform functions are not invoked if the specified key does not exist in the cache.
 *
 * @param cache Target cache. The original is _not_ affected.
 * @param get Function applied to all **read** operations from the cache.
 * @param set Function applied to all **write** operations from the cache.
 */
export function mapCache<T, U, K>(cache: KeyedCache<T, K>, get: (data: T) => U, set: (data: U) => T): KeyedCache<U, K> {
    const getIf = (data?: T) => (data !== undefined ? get(data) : undefined)

    return {
        clear: key => cache.clear(key),
        load: key => cache.load(key).then(getIf),
        save: (key, data) => cache.save(key, set(data)),
    }
}

/**
 * Creates a new {@link KeyedCache} backed by the file system.
 *
 * No optimization is performed. Every method call results in direct calls to `fs`.
 * Errors are always caught, meaning a failed `load` operation looks the same as a
 * cache miss.
 *
 * @param mapKey Function that should describe how a key `K` is mapped to the file system.
 * @param logger Optional logger callback. Omitting this parameter disables logging.
 */
export function createDiskCache<T, K>(
    mapKey: (key: K) => string,
    logger?: (message: string) => void
): KeyedCache<T, K> {
    function logSuccess(prefix: string, key: K): void {
        if (logger) {
            const keyMessage = typeof key === 'object' ? JSON.stringify(key) : key
            logger(`${prefix} for key '${keyMessage}'`)
        }
    }

    function logFailure(prefix: string, key: K, error: unknown): void {
        if (logger) {
            const errorMessage = error instanceof Error ? error.message : error
            const keyMessage = typeof key === 'object' ? JSON.stringify(key) : key
            logger(`${prefix} for key '${keyMessage}': ${errorMessage}`)
        }
    }

    return {
        load: async key => {
            try {
                const target = mapKey(key)

                if (
                    !(await fs.access(target).then(
                        () => true,
                        () => false
                    ))
                ) {
                    logSuccess('load missed', key)
                    return
                }

                const result = JSON.parse(await fs.readFile(target, 'utf-8'))
                logSuccess('load succeeded', key)
                return result
            } catch (error) {
                logFailure('load failed', key, error)
            }
        },
        save: async (key, data) => {
            try {
                const target = mapKey(key)
                await fs.mkdirp(dirname(target))
                await fs.writeFile(target, JSON.stringify(data), { mode: 0o600 })
            } catch (error) {
                logFailure('save failed', key, error)
                return false
            }

            logSuccess('save succeeded', key)
            return true
        },
        clear: async key => {
            try {
                await fs.unlink(mapKey(key))
            } catch (error) {
                logFailure('clear failed', key, error)
                return false
            }

            logSuccess('clear succeeded', key)
            return true
        },
    }
}
