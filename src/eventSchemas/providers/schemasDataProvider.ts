/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'
import _ = require('lodash')
import { SchemaClient } from '../../shared/clients/schemaClient'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'

export interface regionRegistryMap {
    region: string
    registrySchameMapList: registrySchemaMap[]
}

export interface registrySchemaMap {
    registryName: string
    schemaList: Schemas.SchemaSummary[]
}

/**
 * Responsible for retaining registry && schema list per region for Create-New-SAM-Application wizard
 */
export class SchemasDataProvider {
    private static INSTANCE: SchemasDataProvider | undefined
    private readonly cachedRegions: regionRegistryMap[] = []

    public async getRegistires(region: string, client: SchemaClient) {
        const cachedRegion = this.cachedRegions.filter(cacheValue => cacheValue.region === region).shift()
        let registryNames: string[] = []

        // if region is cached, retrieve registries
        if (cachedRegion) {
            registryNames = cachedRegion.registrySchameMapList.reduce(
                (accumulator: string[], item: registrySchemaMap) => {
                    accumulator.push(item.registryName)

                    return accumulator
                },
                []
            )
        }

        // if no registries found, make api query and retain results
        if (_.isEmpty(registryNames)) {
            const registrySchemaMapList: registrySchemaMap[] = []
            const registrySummary = await toArrayAsync(client.listRegistries())
            registrySummary.forEach(summary => registryNames.push(summary.RegistryName!))

            registryNames.map(async registry => {
                const singleItem: registrySchemaMap = {
                    registryName: registry,
                    schemaList: []
                }
                registrySchemaMapList.push(singleItem)
            })

            const item: regionRegistryMap = {
                region: region,
                registrySchameMapList: registrySchemaMapList
            }
            this.cachedRegions.push(item)
        }

        return registryNames
    }

    public async getSchemas(region: string, registryName: string, client: SchemaClient) {
        let schemas = this.cachedRegions
            .filter(x => x.region === region)
            .shift()
            ?.registrySchameMapList.filter(x => x.registryName === registryName)
            .shift()?.schemaList

        // if no schemas found, make api query and retain results given that registryName && region already cached
        if (_.isEmpty(schemas)) {
            schemas = await toArrayAsync(client.listSchemas(registryName))

            const registrySchemaListMap = this.cachedRegions
                .filter(x => x.region === region)
                .shift()
                ?.registrySchameMapList.filter(x => x.registryName === registryName)
                .shift()

            if (registrySchemaListMap) {
                schemas.forEach(item => registrySchemaListMap.schemaList.push(item))
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
