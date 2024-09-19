/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { dirname } from 'path'
import { ErrorInformation, ToolkitError, isFileNotFoundError } from '../errors'
import fs from '../../shared/fs/fs'
import { isWeb } from '../extensionGlobals'
import type { MapSync } from './map'

// TODO(sijaden): further generalize this concept over async references (maybe create a library?)
// It's pretty clear that this interface (and VSC's `Memento`) reduce down to what is essentially
// a "pointer" with RW operations that return futures.

/**
 * A general, basic interface for a cache with key associativity.
 *
 * Look to use {@link MapSync} instead if you need atomicity.
 */
export interface KeyedCache<V, K = string> {
    /**
     * Attempts to read data stored at {@link key}.
     *
     * @param key Target key to read from.
     * @returns `V` on success, `undefined` if {@link key} doesn't exist.
     */
    load(key: K): Promise<V | undefined>

    /**
     * Writes {@link data} to {@link key}.
     *
     * @param key Target key to write to.
     * @param data Data to write.
     */
    save(key: K, data: V): Promise<void>

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
export async function loadOr<V, K>(cache: KeyedCache<V, K>, key: K, fn: () => Promise<V>): Promise<V> {
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
 * @param loadTransform Function applied to all **read** operations from the cache.
 * @param saveTransform Function applied to all **write** operations from the cache.
 */
export function mapCache<V, Vt, K>(
    cache: KeyedCache<V, K>,
    loadTransform: (data: V) => Vt,
    saveTransform: (data: Vt) => V
): KeyedCache<Vt, K> {
    const getIf = (data?: V) => (data !== undefined ? loadTransform(data) : undefined)

    return {
        clear: (key, reason) => cache.clear(key, reason),
        load: (key) => cache.load(key).then(getIf),
        save: (key, data) => cache.save(key, saveTransform(data)),
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
export function createDiskCache<V, K>(
    mapKey: (key: K) => string,
    logger?: (message: string) => void
): KeyedCache<V, K> {
    function log(msg: string, key: K): void {
        if (logger) {
            const keyMessage = typeof key === 'object' ? JSON.stringify(key) : key
            logger(`${msg} key: ${keyMessage}`)
        }
    }

    return {
        load: async (key) => {
            const target = mapKey(key)

            try {
                const result = JSON.parse(await fs.readFileAsString(target))
                log('loaded', key)
                return result
            } catch (error) {
                if (isFileNotFoundError(error)) {
                    log('read failed (file not found)', key)
                    return
                }
                log(`read failed ${error}`, key)
                throw createDiskCacheError(error, 'LOAD', target, key)
            }
        },
        save: async (key, data) => {
            const target = mapKey(key)

            try {
                await fs.mkdir(dirname(target))
                if (isWeb()) {
                    // There is no web-compatible rename() method. So do a regular write.
                    await fs.writeFile(target, JSON.stringify(data))
                } else {
                    // With SSO cache we noticed malformed JSON on read. A guess is that multiple writes
                    // are occuring at the same time. The following is a bandaid that ensures an all-or-nothing
                    // write, though there can still be race conditions with which version remains after overwrites.
                    await fs.writeFile(target, JSON.stringify(data), { mode: 0o600, atomic: true })
                }
            } catch (error) {
                throw createDiskCacheError(error, 'SAVE', target, key)
            }

            log('saved', key)
        },
        clear: async (key, reason) => {
            const target = mapKey(key)

            try {
                await fs.delete(target, { force: false })
            } catch (error) {
                if (isFileNotFoundError(error)) {
                    return log('file not found', key)
                }

                throw createDiskCacheError(error, 'CLEAR', target, key)
            }

            log(`deleted (reason: ${reason})`, key)
        },
    }

    /** Helper to make a disk cache error */
    function createDiskCacheError(error: unknown, operation: 'LOAD' | 'SAVE' | 'CLEAR', target: string, key: K) {
        return DiskCacheError.chain(error, `${operation} failed for '${target}'`, {
            details: { key },
        })
    }
}

/**
 * Represents a generalized error that happened during a disk cache operation.
 *
 * For example, when SSO refreshes a token a disk cache error can occur when it
 * attempts to read/write the disk cache. These errors can be recoverable and do not
 * imply that the SSO session is stale. So by creating a context specific instance it
 * will help to distinguish them when we need to decide if the SSO session is actually
 * stale.
 */
export class DiskCacheError extends ToolkitError.named('DiskCacheError') {
    public constructor(message: string, info?: Omit<ErrorInformation, 'code'>) {
        super(message, { ...info, code: 'DiskCacheError' })
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
        load: async (key) => {
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
