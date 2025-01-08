/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from '@aws-sdk/types'
import { Schemas } from 'aws-sdk'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { getLogger, Logger } from '../../shared/logger'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'

export class Cache {
    public constructor(public readonly credentialsRegionDataList: credentialsRegionDataListMap[]) {}
}

export interface credentialsRegionDataListMap {
    credentials: AWS.Credentials
    regionDataList: regionRegistryMap[]
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

    public constructor(private readonly cache: Cache) {}

    public async getRegistries(region: string, client: SchemaClient, credentials: AWS.Credentials) {
        const cachedRegion = this.cache.credentialsRegionDataList
            .filter((x) => x.credentials === credentials)
            .shift()
            ?.regionDataList.filter((x) => x.region === region)
            .shift()

        try {
            // if region is not cached, make api query and retain results
            if (!cachedRegion || cachedRegion.registryNames.length === 0) {
                const registrySummary = await toArrayAsync(client.listRegistries())
                const registryNames = registrySummary.map((x) => x.RegistryName!)
                this.pushRegionDataIntoCache(region, registryNames, [], credentials)

                return registryNames
            }
        } catch (err) {
            const error = err as Error
            this.logger.error('Failed to get registries: %s', error)

            return undefined
        }

        return cachedRegion!.registryNames
    }

    public async getSchemas(region: string, registryName: string, client: SchemaClient, credentials: AWS.Credentials) {
        const registrySchemasMapList = this.cache.credentialsRegionDataList
            .filter((x) => x.credentials === credentials)
            .shift()
            ?.regionDataList.filter((x) => x.region === region)
            .shift()?.registrySchemasMapList
        let schemas = registrySchemasMapList?.filter((x) => x.registryName === registryName).shift()?.schemaList
        try {
            // if no schemas found, make api query and retain results given that registryName && region already cached
            if (!schemas || schemas.length === 0) {
                schemas = await toArrayAsync(client.listSchemas(registryName))
                const singleItem: registrySchemasMap = { registryName: registryName, schemaList: schemas }
                // wizard setup always calls getRegistries method prior to getSchemas, so this shouldn't be undefined
                if (!registrySchemasMapList) {
                    this.pushRegionDataIntoCache(region, [], [singleItem], credentials)
                }

                if (registrySchemasMapList) {
                    registrySchemasMapList.push(singleItem)
                }
            }
        } catch (err) {
            const error = err as Error
            this.logger.error('Failed to get schemas: %s', error)

            return undefined
        }

        return schemas
    }

    private pushRegionDataIntoCache(
        region: string,
        registryNames: string[],
        registrySchemasMapList: registrySchemasMap[],
        credentials?: AWS.Credentials
    ): void {
        const regionData: regionRegistryMap = {
            region: region,
            registryNames: registryNames,
            registrySchemasMapList: registrySchemasMapList,
        }

        const cachedCredential = this.cache.credentialsRegionDataList
            .filter((x) => x.credentials === credentials)
            .shift()
        cachedCredential?.regionDataList.push(regionData)

        if (!cachedCredential) {
            const regionDataWithCredentials: credentialsRegionDataListMap = {
                credentials: credentials!,
                regionDataList: [regionData],
            }
            this.cache.credentialsRegionDataList.push(regionDataWithCredentials)
        }
    }

    public static getInstance(): SchemasDataProvider {
        if (!SchemasDataProvider.INSTANCE) {
            SchemasDataProvider.INSTANCE = new SchemasDataProvider(new Cache([]))
        }

        return SchemasDataProvider.INSTANCE
    }
}
