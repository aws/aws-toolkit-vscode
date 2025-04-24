/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import { globalKey } from '../globalState'
import { getLogger } from '../logger/logger'
import { waitUntil } from '../utilities/timeoutUtils'

interface WithLock {
    locked: boolean
    timestamp: number
}

interface Resource<V> extends WithLock {
    result: V | undefined
}

const logger = getLogger()

function now() {
    return globals.clock.Date.now()
}

export abstract class CachedResource<V> {
    constructor(
        readonly key: globalKey,
        readonly expirationInMilli: number,
        private readonly defaultValue: Resource<V>
    ) {}

    abstract resourceProvider(): Promise<V>

    async getResource(): Promise<V> {
        const resource = await this.readResourceAndLock()
        // if cache is still fresh, return
        if (resource && resource.result) {
            if (now() - resource.timestamp < this.expirationInMilli) {
                logger.info(`cache hit`)
                // release the lock
                await globals.globalState.update(this.key, {
                    ...resource,
                    locked: false,
                })
                return resource.result
            } else {
                logger.info(`cache hit but cached value is stale, invoking service API to pull the latest response`)
            }
        }

        // catch and error case?
        logger.info(`cache miss, invoking service API to pull the latest response`)
        const latest = await this.resourceProvider()

        // update resource cache and release the lock
        const toUpdate: Resource<V> = {
            locked: false,
            timestamp: now(),
            result: latest,
        }
        await globals.globalState.update(this.key, toUpdate)
        return latest
    }

    async readResourceAndLock(): Promise<Resource<V> | undefined> {
        const _acquireLock = async () => {
            const cachedValue = this.readCacheOrDefault()

            if (!cachedValue.locked) {
                await globals.globalState.update(this.key, {
                    ...cachedValue,
                    locked: true,
                })

                return cachedValue
            }

            return undefined
        }

        const lock = await waitUntil(
            async () => {
                const lock = await _acquireLock()
                logger.info(`try obtaining cache lock %s`, lock)
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

    private readCacheOrDefault(): Resource<V> {
        const cachedValue = globals.globalState.tryGet<Resource<V>>(this.key, Object, {
            ...this.defaultValue,
            locked: false,
            result: undefined,
            timestamp: 0,
        })

        return cachedValue
    }
}
