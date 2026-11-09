/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { globalKey } from '../globalState'
import { getLogger } from '../logger/logger'
import { waitUntil } from '../utilities/timeoutUtils'

/**
 * args:
 *  @member result: the actual resource type callers want to use
 *  @member locked: readWriteLock, while the lock is acquired by one process, the other can't access to it until it's released by the previous
 *  @member timestamp: used for determining the resource is stale or not
 */
interface Resource<V> {
    result: V | undefined
    locked: boolean
    timestamp: number
}

/**
 * GlobalStates schema, which is used for vscode global states deserialization, [globals.globalState#tryGet<T>] etc.
 * The purpose of it is to allow devs to overload the resource into existing global key and no need to create a specific key for only this purpose.
 */
export interface GlobalStateSchema<V> {
    resource: Resource<V>
}

const logger = getLogger('resourceCache')

function now() {
    return globals.clock.Date.now()
}

/**
 * CacheResource utilizes VSCode global states API to cache resources which are expensive to get so that the result can be shared across multiple VSCode instances.
 *  The first VSCode instance invoking #getResource will hold a lock and make the actual network call/FS read to pull the real response.
 *  When the pull is done, the lock will be released and it then caches the result in the global states. Then the rest of instances can now acquire the lock 1 by 1 and read the resource from the cache.
 *
 * constructor:
 *  @param key: global state key, which is used for globals.globalState#update, #tryGet etc.
 *  @param expirationInMilli: cache expiration time in milli seconds
 *  @param defaultValue: default value for the cache if the cache doesn't pre-exist in users' FS
 *  @param waitUntilOption: waitUntil option for acquire lock
 *
 * methods:
 *  @method resourceProvider: implementation needs to implement this method to obtain the latest resource either via network calls or FS read
 *  @method getResource: obtain the resource from cache or pull the latest from the service if the cache either expires or doesn't exist
 */
export abstract class CachedResource<V> {
    constructor(
        private readonly key: globalKey,
        private readonly expirationInMilli: number,
        private readonly defaultValue: GlobalStateSchema<V>,
        private readonly waitUntilOption: { timeout: number; interval: number; truthy: boolean }
    ) {}

    abstract resourceProvider(): Promise<V>

    async getResource(): Promise<V> {
        // Check cache without locking first
        const quickCheck = this.readCacheOrDefault()
        if (quickCheck.resource.result && !quickCheck.resource.locked) {
            const duration = now() - quickCheck.resource.timestamp
            if (duration < this.expirationInMilli) {
                logger.debug(
                    `cache hit (fast path), duration(%sms) is less than expiration(%sms), returning cached value: %s`,
                    duration,
                    this.expirationInMilli,
                    this.key
                )
                return quickCheck.resource.result
            }
        }

        const cachedValue = await this.tryLoadResourceAndLock()
        const resource = cachedValue?.resource

        // If cache is still fresh, return cached result, otherwise pull latest from the service
        if (cachedValue && resource && resource.result) {
            const duration = now() - resource.timestamp
            if (duration < this.expirationInMilli) {
                logger.debug(
                    `cache hit, duration(%sms) is less than expiration(%sms), returning cached value: %s`,
                    duration,
                    this.expirationInMilli,
                    this.key
                )
                // release the lock
                await this.releaseLock(resource, cachedValue)
                return resource.result
            }

            logger.debug(
                `cache is stale, duration(%sms) is older than expiration(%sms), pulling latest resource: %s`,
                duration,
                this.expirationInMilli,
                this.key
            )
        } else {
            logger.info(`cache miss, pulling latest resource: %s`, this.key)
        }

        /**
         * Possible paths here
         *  1. cache doesn't exist.
         *  2. cache exists but expired.
         *  3. lock is held by other process and the waiting time is greater than the specified waiting time
         */
        try {
            // Make the real network call / FS read to pull the resource
            const latest = await this.resourceProvider()

            // Update resource cache and release the lock
            const r: Resource<V> = {
                locked: false,
                timestamp: now(),
                result: latest,
            }
            await this.releaseLock(r)
            logger.info(`loaded latest resource and updated cache: %s`, this.key)
            return latest
        } catch (e) {
            logger.error(`failed to load latest resource, releasing lock: %s`, this.key)
            await this.releaseLock()
            throw e
        }
    }

    // This method will lock the resource so other callers have to wait until the lock is released, otherwise will return undefined if it times out
    private async tryLoadResourceAndLock(): Promise<GlobalStateSchema<V> | undefined> {
        const _acquireLock = async () => {
            const cachedValue = this.readCacheOrDefault()

            if (!cachedValue.resource.locked) {
                await this.lockResource(cachedValue)
                return cachedValue
            }

            return undefined
        }

        const lock = await waitUntil(async () => {
            const lock = await _acquireLock()
            logger.debug(`trying to acquire resource cache lock: %s`, this.key)
            if (lock) {
                return lock
            }
        }, this.waitUntilOption)

        return lock
    }

    async lockResource(baseCache: GlobalStateSchema<V>): Promise<void> {
        await this.updateResourceCache({ locked: true }, baseCache)
    }

    async releaseLock(): Promise<void>
    async releaseLock(resource: Partial<Resource<V>>): Promise<void>
    async releaseLock(resource: Partial<Resource<V>>, baseCache: GlobalStateSchema<V>): Promise<void>
    async releaseLock(resource?: Partial<Resource<V>>, baseCache?: GlobalStateSchema<V>): Promise<void> {
        if (!resource) {
            await this.updateResourceCache({ locked: false }, undefined)
        } else if (baseCache) {
            await this.updateResourceCache(resource, baseCache)
        } else {
            await this.updateResourceCache(resource, undefined)
        }
    }

    async clearCache() {
        const baseCache = this.readCacheOrDefault()
        await this.updateResourceCache({ result: undefined, timestamp: 0, locked: false }, baseCache)
    }

    private async updateResourceCache(resource: Partial<Resource<any>>, cache: GlobalStateSchema<any> | undefined) {
        const baseCache = cache ?? this.readCacheOrDefault()

        const toUpdate: GlobalStateSchema<V> = {
            ...baseCache,
            resource: {
                ...baseCache.resource,
                ...resource,
            },
        }

        await globals.globalState.update(this.key, toUpdate)
    }

    private readCacheOrDefault(): GlobalStateSchema<V> {
        const cachedValue = globals.globalState.tryGet<GlobalStateSchema<V>>(this.key, Object, {
            ...this.defaultValue,
            resource: {
                ...this.defaultValue.resource,
                locked: false,
                result: undefined,
                timestamp: 0,
            },
        })

        return cachedValue
    }
}
