/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../logger'
import { fromPackage, migrateSetting, SettingsConfiguration } from '../../settingsConfiguration'
import { stripUndefined, toRecord } from '../../utilities/collectionUtils'
import { once } from '../../utilities/functionUtils'
import { ClassToInterfaceType, keys } from '../../utilities/tsUtils'
import { DefaultSamCliLocationProvider, SamCliLocationProvider } from './samCliLocator'

// TODO(sijaden): remove after a few releases
async function migrateLegacySettings() {
    await migrateSetting(
        {
            key: 'aws.manuallySelectedBuckets',
            type: SavedBuckets,
        },
        {
            key: 'aws.samcli.manuallySelectedBuckets',
            type: SavedBuckets,
        }
    )

    await migrateSetting(
        {
            key: 'aws.sam.enableCodeLenses',
            type: Boolean,
        },
        {
            key: 'aws.samcli.enableCodeLenses',
            type: Boolean,
        }
    )

    await migrateSetting(
        {
            key: 'aws.samcli.lambda.timeout',
            type: Number,
        },
        {
            key: 'aws.samcli.lambdaTimeout',
            type: Number,
        }
    )
}

const migrate = once(migrateLegacySettings)

const LOCAL_TIMEOUT_DEFAULT_MILLIS: number = 90000
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
}

export class SamCliConfig extends fromPackage('aws.samcli', description) {
    public constructor(
        private readonly locationProvider: SamCliLocationProvider = new DefaultSamCliLocationProvider(),
        settings: ClassToInterfaceType<SettingsConfiguration> = new SettingsConfiguration()
    ) {
        super(settings)
        migrate()
    }

    public async detectLocation(): Promise<string | undefined> {
        return this.locationProvider.getLocation()
    }

    /**
     * Gets location of `sam` from user config, or tries to find `sam` on the
     * system if the user config is invalid.
     *
     * @returns `undefined` if `sam` was not found on the system
     */
    public async getOrDetectSamCli(): Promise<{ path: string | undefined; autoDetected: boolean }> {
        const fromConfig = this.get('location', '')

        if (fromConfig) {
            return { path: fromConfig, autoDetected: false }
        }

        const fromSearch = await this.detectLocation()
        return { path: fromSearch, autoDetected: true }
    }

    public getSavedBuckets(): SavedBuckets | undefined {
        try {
            return this.get('manuallySelectedBuckets')
        } catch (error) {
            this.delete('manuallySelectedBuckets')
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
        return this.get('lambdaTimeout', LOCAL_TIMEOUT_DEFAULT_MILLIS)
    }
}
