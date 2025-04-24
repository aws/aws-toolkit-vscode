/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { globalKey } from '../globalState'
import { getLogger } from '../logger/logger'
import { waitUntil } from '../utilities/timeoutUtils'

interface Resource<V> {
    result: V | undefined
    locked: boolean
    timestamp: number
}

// GlobalStates schema, which is used for vscode global states deserialization
// [globals.globalState.tryGet<T>]
interface GlobalStateSchema<V> {
    resource: Resource<V>
}

const logger = getLogger()

function now() {
    return globals.clock.Date.now()
}

export abstract class CachedResource<V> {
    constructor(
        private readonly key: globalKey,
        private readonly expirationInMilli: number,
        private readonly defaultValue: GlobalStateSchema<V>
    ) {}

    abstract resourceProvider(): Promise<V>

    async getResource(): Promise<V> {
        const cachedValue = await this.readResourceAndLock()
        const resource = cachedValue?.resource

        // If cache is still fresh, return cached result, otherwise pull latest from the service
        if (cachedValue && resource && resource.result) {
            if (now() - resource.timestamp < this.expirationInMilli) {
                logger.info(`cache hit`)
                // release the lock
                await this.updateCache(cachedValue, {
                    ...resource,
                    locked: false,
                })
                return resource.result
            } else {
                logger.info(`cache hit but cached value is stale, invoking service API to pull the latest response`)
            }
        }

        logger.info(`cache miss, invoking service API to pull the latest response`)
        try {
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
    private async readResourceAndLock(): Promise<GlobalStateSchema<V> | undefined> {
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

        const lock = await waitUntil(
            async () => {
                const lock = await _acquireLock()
                logger.info(`try obtain resource cache read lock %s`, lock)
                if (lock) {
                    return lock
                }
            },
            { timeout: 15000, interval: 1500, truthy: true } // TODO: pass via ctor
        )

        return lock
    }

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
