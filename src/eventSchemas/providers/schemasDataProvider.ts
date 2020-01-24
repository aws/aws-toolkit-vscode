/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, Schemas } from 'aws-sdk'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { getLogger, Logger } from '../../shared/logger'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'

export class Cache {
    public constructor(public readonly regionDataList: regionRegistryMap[]) {}
}

export interface regionRegistryMap {
    region: string
    registryNames: string[]
    registrySchemasMapList: registrySchemasMap[]
}

export interface registrySchemasMap {
    registryName: string
    schemaList: Schemas.SchemaSummary[]
}

/**
 * Responsible for retaining registry && schema list per region for Create-New-SAM-Application wizard
 */
export class SchemasDataProvider {
    private static INSTANCE: SchemasDataProvider | undefined
    private readonly logger: Logger = getLogger()

    public constructor(private readonly credentials: Credentials, private readonly cache: Cache) {}

    public async getRegistries(region: string, client: SchemaClient) {
        const cachedRegion = this.cache.regionDataList.filter(x => x.region === region).shift()
        try {
            // if region is not cached, make api query and retain results
            if (!cachedRegion || cachedRegion.registryNames.length === 0) {
                const registrySummary = await toArrayAsync(client.listRegistries())
                const registryNames = registrySummary.map(x => x.RegistryName!)
                this.pushRegionDataIntoCache(region, registryNames, [])

                return registryNames
            }
        } catch (err) {
            const error = err as Error
            this.logger.error('Error retrieving registries', error)

            return undefined
        }

        return cachedRegion!.registryNames
    }

    public async getSchemas(region: string, registryName: string, client: SchemaClient) {
        const registrySchemasMapList = this.cache.regionDataList.filter(x => x.region === region).shift()
            ?.registrySchemasMapList
        let schemas = registrySchemasMapList?.filter(x => x.registryName === registryName).shift()?.schemaList
        try {
            // if no schemas found, make api query and retain results given that registryName && region already cached
            if (!schemas || schemas.length === 0) {
                schemas = await toArrayAsync(client.listSchemas(registryName))
                const singleItem: registrySchemasMap = { registryName: registryName, schemaList: schemas }
                //wizard setup always calls getRegistries method prior to getSchemas, so this shouldn't be undefined
                if (!registrySchemasMapList) {
                    this.pushRegionDataIntoCache(region, [], [singleItem])
                }

                if (registrySchemasMapList) {
                    registrySchemasMapList.push(singleItem)
                }
            }
        } catch (err) {
            const error = err as Error
            this.logger.error('Error retrieving schemas', error)

            return undefined
        }

        return schemas
    }

    private pushRegionDataIntoCache(
        region: string,
        registryNames: string[],
        registrySchemasMapList: registrySchemasMap[]
    ): void {
        const regionData: regionRegistryMap = {
            region: region,
            registryNames: registryNames,
            registrySchemasMapList: registrySchemasMapList
        }

        this.cache.regionDataList.push(regionData)
    }

    public static getInstance(credential: Credentials, cache: Cache = new Cache([])): SchemasDataProvider {
        if (!SchemasDataProvider.INSTANCE || SchemasDataProvider.INSTANCE.credentials !== credential) {
            SchemasDataProvider.INSTANCE = new SchemasDataProvider(credential, cache)
        }

        return SchemasDataProvider.INSTANCE
    }
}
