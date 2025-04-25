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
 *  [result]: the actual resource type callers want to use
 *  [locked]: readWriteLock, while the lock is acquired by one process, the other can't access to it until it's released by the previous
 *  [timestamp]: used for determining the resource is stale or not
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

const logger = getLogger()

function now() {
    return globals.clock.Date.now()
}

/**
 * args:
 *  [key]: global state key, which is used for globals.globalState#update, #tryGet etc.
 *  [expirationInMilli]: cache expiration time in milli seconds
 *  [defaultValue]: default value for the cache if the cache doesn't pre-exist in users' FS
 *  [waitUntilOption]: waitUntil option for acquire lock
 *
 * methods:
 *  #resourceProvider: implementation needs to implement this method to obtain the latest resource either via network calls or FS read
 *  #getResource: obtain the resource from cache or pull the latest from the service if the cache either expires or doesn't exist
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
        const cachedValue = await this.tryLoadResourceAndLock()
        const resource = cachedValue?.resource

        // If cache is still fresh, return cached result, otherwise pull latest from the service
        if (cachedValue && resource && resource.result) {
            const duration = now() - resource.timestamp
            if (duration < this.expirationInMilli) {
                logger.info(`cache hit, duration(%sms) is less than expiration(%sms)`, duration, this.expirationInMilli)
                // release the lock
                await this.updateCache(cachedValue, {
                    ...resource,
                    locked: false,
                })
                return resource.result
            } else {
                logger.info(
                    `cached value is stale, duration(%sms) is older than expiration(%sms), invoking service API to pull the latest response`,
                    duration,
                    this.expirationInMilli
                )
            }
        }

        logger.info(`cache miss, invoking service API to pull the latest response`)
        try {
            // Make the real network call / FS read to pull the resource
            const latest = await this.resourceProvider()

            // Update resource cache and release the lock
            const r: Resource<V> = {
                locked: false,
                timestamp: now(),
                result: latest,
            }
            await this.updateCache(cachedValue, r)
            return latest
        } catch (e) {
            await this.releaseLock()
            throw e
        }
    }

    // This method will lock the resource so other callers have to wait until the lock is released, otherwise will return undefined if it times out
    private async tryLoadResourceAndLock(): Promise<GlobalStateSchema<V> | undefined> {
        const _acquireLock = async () => {
            const cachedValue = this.readCacheOrDefault()

            if (!cachedValue.resource.locked) {
                await this.updateCache(cachedValue, {
                    ...cachedValue.resource,
                    locked: true,
                })
                return cachedValue
            }

            return undefined
        }

        const lock = await waitUntil(async () => {
            const lock = await _acquireLock()
            logger.info(`try obtain resource cache read lock %s`, lock)
            if (lock) {
                return lock
            }
        }, this.waitUntilOption)

        return lock
    }

    // TODO: releaseLock and updateCache do similar things, how to improve
    async releaseLock() {
        await globals.globalState.update(this.key, {
            ...this.readCacheOrDefault(),
            locked: false,
        })
    }

    private async updateCache(cache: GlobalStateSchema<any> | undefined, resource: Resource<any>) {
        await globals.globalState.update(this.key, {
            ...(cache ? cache : this.readCacheOrDefault()),
            resource: resource,
        })
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
