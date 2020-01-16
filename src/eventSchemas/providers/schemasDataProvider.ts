/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'

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
    private readonly cachedRegions: regionRegistryMap[] = []

    public async getRegistries(region: string, client: SchemaClient) {
        const cachedRegion = this.cachedRegions.filter(cacheValue => cacheValue.region === region).shift()

        // if region is not cached, make api query and retain results
        if (!cachedRegion) {
            const registrySummary = await toArrayAsync(client.listRegistries())
            const registryNames = registrySummary.map(x => x.RegistryName!)
            const item: regionRegistryMap = {
                region: region,
                registryNames: registryNames,
                registrySchemasMapList: []
            }
            this.cachedRegions.push(item)

            return registryNames
        }

        return cachedRegion!.registryNames
    }

    public async getSchemas(region: string, registryName: string, client: SchemaClient) {
        const registrySchemasMapList = this.cachedRegions.filter(x => x.region === region).shift()
            ?.registrySchemasMapList
        let schemas = registrySchemasMapList?.filter(x => x.registryName === registryName).shift()?.schemaList

        // if no schemas found, make api query and retain results given that registryName && region already cached
        if (!schemas || schemas.length === 0) {
            schemas = await toArrayAsync(client.listSchemas(registryName))

            if (registrySchemasMapList) {
                const singleItem: registrySchemasMap = {
                    registryName: registryName,
                    schemaList: schemas
                }

                this.cachedRegions
                    .filter(x => x.region === region)
                    .shift()
                    ?.registrySchemasMapList.push(singleItem)
            }
        }

        return schemas
    }

    public getCachedRegionMap(): regionRegistryMap[] {
        return this.cachedRegions
    }

    public static getInstance(): SchemasDataProvider {
        if (!SchemasDataProvider.INSTANCE) {
            SchemasDataProvider.INSTANCE = new SchemasDataProvider()
        }

        return SchemasDataProvider.INSTANCE
    }
}
