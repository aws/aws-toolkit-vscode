/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash'
import { getLogger } from '../logger/logger'
import type { KeyedCache } from './cacheUtils'

/**
 * Simply maps a Key to an Object. Everything is done in memory, allowing for atomic updates.
 *
 * There is a common use case for this class, so look to reuse this when possible.
 * Benefits, instead of making your own:
 * - A key does not have to be a string, {@link NestedMap.hash} enables this
 * - Implements most of the boilerplate
 * - Has a {@link NestedMap.default} property which is returned from {@link NestedMap.get()}
 *   in the case {@link NestedMap.has()} would return false.
 */
export abstract class NestedMap<Key, Value = { [key: string]: any }> implements MapSync<Key, Value> {
    private readonly data: { [key: string]: Value | undefined } = {}

    has(key: Key): boolean {
        return this.data[this.hash(key)] !== undefined
    }

    /**
     * IMPORTANT: If getting a key without having {@link set()} a value, the {@link default} will be returned.
     * Use {@link has()} to check for existence before calling {@link get()}, if necessary.
     */
    get(key: Key): Value {
        const actualKey = this.hash(key)
        const result = this.data[actualKey]
        return result ?? this.default
    }

    set(key: Key, data: Partial<Value>): void {
        const currentData = this.get(key)
        // deep merge the objects
        this.data[this.hash(key)] = _.merge(currentData, data)
    }

    delete(key: Key, reason?: string): void {
        delete this.data[this.hash(key)]
        if (reason) {
            getLogger().debug(`${this.name}: cleared cache, key: %O, reason: ${reason}`, key)
        }
    }

    /**
     * Converts the user-provided key to a string so that it can be used
     * as an object key.
     */
    protected abstract hash(key: Key): string

    /**
     * The name of the implementation, for logging purposes
     */
    protected abstract get name(): string

    /**
     * The default value returned from {@link get}() when {@link has}() is false
     */
    protected abstract get default(): Value
}

/**
 * An implementation of NestedMap specifically used for mapping strings to objects.
 * It's basically a map, except you can partially add values
 */
export class RecordMap<Value = { [key: string]: any }> extends NestedMap<string, Value> {
    protected override hash(key: string): string {
        return key
    }

    protected override get name(): string {
        return 'RecordMap'
    }

    protected override get default(): Value {
        return {} as Value
    }
}

/**
 * A synchronous version of a Map of Maps.
 * - This allows for atomic updates as it is not async.
 * - They Key does not need to be a string
 *
 * There are similarities to {@link KeyedCache}, which is why this class' name
 * explicitly has 'Sync'.
 */
export interface MapSync<Key, ReturnObject = { [key: string]: any }> {
    /**
     * Attempts to read data stored at {@link key}.
     *
     * @param key Target key to read from.
     * @returns `ReturnObject` regardless of cache hit or miss. Use {@link has()} to verify existence,
     *          otherwise a default object may be returned.
     */
    get(key: Key): ReturnObject

    /**
     * Writes {@link data} to {@link key}.
     *
     * @param key Target key to write to.
     * @param data Data to write.
     */
    set(key: Key, data: ReturnObject): void

    /**
     * Returns true if the given key exists in the cache.
     *
     * @param key Target key to check.
     * @returns True if the key exists, false otherwise.
     */
    has(key: Key): boolean

    /**
     * Deletes data stored at {@link key}, if any.
     *
     * @param key Target key to clear.
     * @param reason Partial log message explaining why the data is being deleted.
     */
    delete(key: Key, reason: string): void
}
