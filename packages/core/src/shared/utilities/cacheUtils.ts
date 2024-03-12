/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { dirname } from 'path'
import { ToolkitError, isFileNotFoundError } from '../errors'
import { SystemUtilities } from '../systemUtilities'

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
     */
    save(key: K, data: T): Promise<void>

    /**
     * Deletes data stored at {@link key}, if any.
     *
     * @param key Target key to clear.
     * @param reason Partial log message explaining why the data is being deleted.
     */
    clear(key: K, reason: string): Promise<void>
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
        clear: (key, reason) => cache.clear(key, reason),
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
    function log(msg: string, key: K): void {
        if (logger) {
            const keyMessage = typeof key === 'object' ? JSON.stringify(key) : key
            logger(`${msg} key: ${keyMessage}`)
        }
    }

    return {
        load: async key => {
            const target = mapKey(key)

            try {
                const result = JSON.parse(await SystemUtilities.readFile(target))
                log('loaded', key)
                return result
            } catch (error) {
                if (isFileNotFoundError(error)) {
                    log('read failed (file not found)', key)
                    return
                }
                log(`read failed ${error}`, key)
                throw ToolkitError.chain(error, `Failed to read from "${target}"`, {
                    code: 'FSReadFailed',
                    details: { key },
                })
            }
        },
        save: async (key, data) => {
            const target = mapKey(key)

            try {
                await SystemUtilities.createDirectory(dirname(target))
                await SystemUtilities.writeFile(target, JSON.stringify(data), { mode: 0o600 })
            } catch (error) {
                throw ToolkitError.chain(error, `Failed to save "${target}"`, {
                    code: 'FSWriteFailed',
                    details: { key },
                })
            }

            log('saved', key)
        },
        clear: async (key, reason) => {
            const target = mapKey(key)

            try {
                await SystemUtilities.delete(target)
            } catch (error) {
                if (isFileNotFoundError(error)) {
                    return log('file not found', key)
                }

                throw ToolkitError.chain(error, `Failed to delete "${target}"`, {
                    code: 'FSDeleteFailed',
                    details: { key },
                })
            }

            log(`deleted (reason: ${reason})`, key)
        },
    }
}

export function createSecretsCache(
    secrets: vscode.SecretStorage,
    logger?: (message: string) => void
): KeyedCache<string> {
    function log(msg: string, key: string): void {
        if (logger) {
            logger(`${msg} key: ${key}`)
        }
    }

    return {
        load: async key => {
            try {
                const value = await secrets.get(key)

                if (value === undefined) {
                    log('read failed (key not found)', key)
                    return
                }

                log('loaded', key)
                return value
            } catch (error) {
                throw ToolkitError.chain(error, 'Failed to get value from secrets storage', {
                    code: 'SecretsGetFailed',
                    details: { key },
                })
            }
        },
        save: async (key, data) => {
            try {
                await secrets.store(key, data)
            } catch (error) {
                throw ToolkitError.chain(error, 'Failed to save to secrets storage ', {
                    code: 'SecretsSaveFailed',
                    details: { key },
                })
            }

            log('saved', key)
        },
        clear: async (key, reason) => {
            try {
                await secrets.delete(key)
            } catch (error) {
                throw ToolkitError.chain(error, 'Failed to delete key from secrets storage', {
                    code: 'SecretsDeleteFailed',
                    details: { key },
                })
            }

            log(`deleted (reason: ${reason})`, key)
        },
    }
}
