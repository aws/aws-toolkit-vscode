/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../logger'
import { fromExtensionManifest, Settings } from '../../settings'
import { stripUndefined, toRecord } from '../../utilities/collectionUtils'
import { ClassToInterfaceType, keys } from '../../utilities/tsUtils'
import { SamCliLocationProvider } from './samCliLocator'
import { onceChanged } from '../../utilities/functionUtils'

const localTimeoutDefaultMillis: number = 90000
interface SavedBuckets {
    [profile: string]: { [region: string]: string }
}

function SavedBuckets(value: unknown): SavedBuckets {
    // Legacy code used to save data as strings
    const buckets = typeof value === 'string' ? JSON.parse(value) : value

    if (typeof buckets !== 'object' || !buckets) {
        throw new TypeError('Value was not a non-null object')
    }

    const result = toRecord(keys(buckets), k => {
        const v = buckets[k]

        if (typeof v !== 'object' || !v) {
            getLogger().warn(`Settings: removed invalid key "${k}" from saved buckets`)
            return undefined
        }

        return toRecord(keys(v), p => {
            const bucket = v[p]

            if (typeof bucket !== 'string') {
                getLogger().warn(`Settings: removed invalid key "${k}.${p}" from saved buckets`)
                return undefined
            }

            return bucket
        })
    })

    stripUndefined(result)

    return result as SavedBuckets
}

const description = {
    location: String,
    lambdaTimeout: Number,
    enableCodeLenses: Boolean,
    manuallySelectedBuckets: SavedBuckets,
    legacyDeploy: Boolean,
}

export class SamCliSettings extends fromExtensionManifest('aws.samcli', description) {
    protected static readonly logIfChanged = onceChanged((s: string) => getLogger().info(s))

    public constructor(
        private readonly locationProvider = new SamCliLocationProvider(),
        settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(settings)
    }

    /**
     * Gets location of `sam` from:
     * 1. user config (if any)
     * 2. previous location cached in `getLocation` (if valid)
     * 3. system search (done by `getLocation`)
     *
     * @returns `autoDetected=true` if auto-detection was _attempted_.
     */
    public async getOrDetectSamCli(
        forceSearch?: boolean
    ): Promise<{ path: string | undefined; autoDetected: boolean }> {
        const fromConfig = this.get('location', '')

        if (fromConfig) {
            SamCliSettings.logIfChanged(`SAM CLI location (from settings): ${fromConfig}`)
            return { path: fromConfig, autoDetected: false }
        }

        const fromSearch = await this.locationProvider.getLocation(forceSearch)
        SamCliSettings.logIfChanged(`SAM CLI location (version: ${fromSearch?.version}): ${fromSearch?.path}`)
        return { path: fromSearch?.path, autoDetected: true }
    }

    public getSavedBuckets(): SavedBuckets | undefined {
        try {
            return this.get('manuallySelectedBuckets')
        } catch (error) {
            void this.delete('manuallySelectedBuckets')
        }
    }

    /**
     * Writes a single new saved bucket to the stored buckets setting, combining previous saved data
     * if it exists. One saved bucket is limited per region per profile.
     */
    public async updateSavedBuckets(profile: string, region: string, bucket: string): Promise<boolean> {
        const oldBuckets = this.getSavedBuckets()

        return this.update('manuallySelectedBuckets', {
            ...oldBuckets,
            [profile]: {
                ...(oldBuckets?.[profile] ?? {}),
                [region]: bucket,
            },
        })
    }

    public getLocalInvokeTimeout(): number {
        return this.get('lambdaTimeout', localTimeoutDefaultMillis)
    }

    static #instance: SamCliSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
