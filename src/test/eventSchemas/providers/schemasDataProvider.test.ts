/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    Cache,
    credentialsRegionDataListMap,
    SchemasDataProvider,
} from '../../../eventSchemas/providers/schemasDataProvider'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { stub } from '../../utilities/stubber'

describe('schemasDataProvider', function () {
    const testRegion = 'testRegion'
    const testRegion2 = 'testRegion2'
    const testRegistry = 'testRegistry'
    const testRegistry2 = 'testRegistry2'
    const testSchema = 'testSchema'
    const testSchema2 = 'testSchema2'
    const registrySummary1 = { RegistryName: testRegistry }
    const registrySummary2 = { RegistryName: testRegistry2 }
    const schemaSummary = { SchemaName: testSchema }
    const schemaSummary2 = { SchemaName: testSchema2 }
    const testCredentials = {} as any as AWS.Credentials
    const testCredentials2 = {} as any as AWS.Credentials

    let dataProviderObject: SchemasDataProvider
    let cacheData: Cache

    function createSchemaClient() {
        const client = stub(DefaultSchemaClient, { regionCode: 'region-1' })

        client.listRegistries.onCall(0).returns(asyncGenerator([registrySummary1, registrySummary2]))
        client.listRegistries.onCall(1).returns(asyncGenerator([registrySummary1]))

        client.listSchemas.onCall(0).returns(asyncGenerator([schemaSummary, schemaSummary2]))
        client.listSchemas.onCall(1).returns(asyncGenerator([schemaSummary]))

        return client
    }

    beforeEach(async function () {
        const regionDataWithCredentials: credentialsRegionDataListMap = {
            credentials: testCredentials,
            regionDataList: [],
        }
        cacheData = new Cache([regionDataWithCredentials])
        dataProviderObject = new SchemasDataProvider(cacheData)
    })

    describe('getRegistries', function () {
        it('should return registries for given region', async function () {
            const registryNames = await dataProviderObject.getRegistries(
                testRegion,
                createSchemaClient(),
                testCredentials
            )
            assert.ok(registryNames!.length === 2, 'unexpected number of registries returned')
            assert.strictEqual(registryNames![0], testRegistry, 'testRegistry name should match')
            assert.strictEqual(registryNames![1], testRegistry2, 'testRegistry2 name should match')
        })

        it('should retain results when it is queried with same credentials ', async function () {
            const client = createSchemaClient()
            await dataProviderObject.getRegistries(testRegion, client, testCredentials)
            await dataProviderObject.getRegistries(testRegion2, client, testCredentials)

            assert.ok(
                cacheData.credentialsRegionDataList.length === 1,
                'Cache should contain data for a single credential'
            )
            assert.strictEqual(
                cacheData.credentialsRegionDataList[0].credentials,
                testCredentials,
                'Credentials key should match'
            )
            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 2,
                'Single cache element should have two region data'
            )

            const regionData1 = cacheData.credentialsRegionDataList[0].regionDataList[0]
            const regionData2 = cacheData.credentialsRegionDataList[0].regionDataList[1]

            assert.strictEqual(regionData1.region, testRegion)
            assert.strictEqual(regionData2.region, testRegion2)

            assert.ok(regionData1.registryNames.length === 2, 'First region should have two registryNames')
            assert.ok(regionData2.registryNames.length === 1, 'Second region should have one registryName')

            assert.deepStrictEqual(
                regionData1.registrySchemasMapList,
                [],
                'First region should have an empty registrySchemasMapList'
            )

            assert.deepStrictEqual(
                regionData2.registrySchemasMapList,
                [],
                'Second region should have an empty registrySchemasMapList'
            )
        })

        it('should retain results when it is queried with different credentials ', async function () {
            const client = createSchemaClient()
            await dataProviderObject.getRegistries(testRegion, client, testCredentials)
            await dataProviderObject.getRegistries(testRegion, client, testCredentials2)

            assert.ok(cacheData.credentialsRegionDataList.length === 2, 'Cache should contain data for two credentials')
            assert.strictEqual(
                cacheData.credentialsRegionDataList[0].credentials,
                testCredentials,
                'First cache element should have a matching credentials key'
            )
            assert.strictEqual(
                cacheData.credentialsRegionDataList[1].credentials,
                testCredentials2,
                'Second cache element should have a matching credentials key'
            )

            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 1,
                'First cache element should have a single region data'
            )
            assert.ok(
                cacheData.credentialsRegionDataList[1].regionDataList.length === 1,
                'Second cache element should have a single region data'
            )
        })

        it('should return undefined when error occurs', async function () {
            const client = createSchemaClient()
            client.listRegistries.reset()
            client.listRegistries.throws(new Error('Custom error'))

            const result = await dataProviderObject.getRegistries(testRegion, client, testCredentials)

            assert.strictEqual(result, undefined)
            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 0,
                'No data should be cached when error occurs'
            )
        })
    })

    describe('getSchemas', function () {
        it('should return schemas for given region', async function () {
            const schemas = await dataProviderObject.getSchemas(
                testRegion,
                testRegistry,
                createSchemaClient(),
                testCredentials
            )

            assert.ok(schemas!.length === 2, 'Unexpected number of schemas returned')
            assert.strictEqual(schemas![0], schemaSummary, 'schemaSummary should match')
            assert.strictEqual(schemas![1], schemaSummary2, 'schemaSummary2 should match')
        })

        it('should retain results when it is queried with same credentials ', async function () {
            const client = createSchemaClient()
            await dataProviderObject.getSchemas(testRegion, testRegistry, client, testCredentials)
            await dataProviderObject.getSchemas(testRegion, testRegistry2, client, testCredentials)

            assert.ok(
                cacheData.credentialsRegionDataList.length === 1,
                'Cache should contain data for a single credential'
            )
            assert.strictEqual(
                cacheData.credentialsRegionDataList[0].credentials,
                testCredentials,
                'Credentials key should match'
            )
            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 1,
                'Cache should contain data for a single region'
            )

            const regionData = cacheData.credentialsRegionDataList[0].regionDataList[0]

            assert.ok(
                regionData.registrySchemasMapList.length === 2,
                'There should be 2 elements in registrySchemasMapList'
            )
            assert.deepStrictEqual(
                regionData.registrySchemasMapList[0].schemaList,
                [schemaSummary, schemaSummary2],
                'First registry should have two schemas'
            )

            assert.deepStrictEqual(
                regionData.registrySchemasMapList[1].schemaList,
                [schemaSummary],
                'Second registry should have one schema'
            )
        })

        it('should retain results when it is queried with different credentials ', async function () {
            const client = createSchemaClient()
            await dataProviderObject.getSchemas(testRegion, testRegistry, client, testCredentials)
            await dataProviderObject.getSchemas(testRegion, testRegistry, client, testCredentials2)

            assert.ok(cacheData.credentialsRegionDataList.length === 2, 'Cache should contain data for two credentials')
            assert.strictEqual(
                cacheData.credentialsRegionDataList[0].credentials,
                testCredentials,
                'Credentials key should match for first element'
            )
            assert.strictEqual(
                cacheData.credentialsRegionDataList[1].credentials,
                testCredentials2,
                'Credentials key should match for second element'
            )

            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 1,
                'First cache element should have a single region data'
            )
            assert.ok(
                cacheData.credentialsRegionDataList[1].regionDataList.length === 1,
                'Second cache element should have a single region data'
            )
        })

        it('should return undefined when error occurs ', async function () {
            const client = createSchemaClient()
            client.listSchemas.reset()
            client.listSchemas.throws(new Error('Custom error'))

            const result = await dataProviderObject.getSchemas(testRegion, testRegistry, client, testCredentials)

            assert.strictEqual(result, undefined)
            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 0,
                'No data should be cached when error occurs'
            )
        })
    })
})
