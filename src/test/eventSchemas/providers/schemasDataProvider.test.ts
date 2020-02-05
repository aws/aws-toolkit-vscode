/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { RegistrySummary, SchemaSummary } from 'aws-sdk/clients/schemas'
import * as sinon from 'sinon'
import {
    Cache,
    credentialsRegionDataListMap,
    SchemasDataProvider
} from '../../../eventSchemas/providers/schemasDataProvider'
import { MockSchemaClient } from '../../shared/clients/mockClients'
import { asyncGenerator } from '../../utilities/collectionUtils'

describe('schemasDataProvider', () => {
    let sandbox: sinon.SinonSandbox
    let dataProviderObject: SchemasDataProvider
    let cacheData: Cache

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        const regionDataWithCredentials: credentialsRegionDataListMap = {
            credentials: testCredentials,
            regionDataList: []
        }
        cacheData = new Cache([regionDataWithCredentials])
        dataProviderObject = new SchemasDataProvider(cacheData)

        const clientStubRegistry = sandbox.stub(schemaClient, 'listRegistries')
        clientStubRegistry.onCall(0).returns(asyncGenerator([registrySummary1, registrySummary2]))
        clientStubRegistry.onCall(1).returns(asyncGenerator([registrySummary1]))

        const clientStubSchema = sandbox.stub(schemaClient, 'listSchemas')
        clientStubSchema.onCall(0).returns(asyncGenerator([schemaSummary, schemaSummary2]))
        clientStubSchema.onCall(1).returns(asyncGenerator([schemaSummary]))
    })

    afterEach(() => {
        sandbox.restore()
    })

    const TEST_REGION = 'testRegion'
    const TEST_REGION2 = 'testRegion2'
    const TEST_REGISTRY = 'testRegistry'
    const TEST_REGISTRY2 = 'testRegistry2'
    const TEST_SCHEMA = 'testSchema'
    const TEST_SCHEMA2 = 'testSchema2'
    const registrySummary1 = { RegistryName: TEST_REGISTRY }
    const registrySummary2 = { RegistryName: TEST_REGISTRY2 }
    const schemaSummary = { SchemaName: TEST_SCHEMA }
    const schemaSummary2 = { SchemaName: TEST_SCHEMA2 }
    const schemaClient = new MockSchemaClient(TEST_REGION)
    const testCredentials = ({} as any) as AWS.Credentials
    const testCredentials2 = ({} as any) as AWS.Credentials

    describe('getRegistries', () => {
        it('should return registries for given region', async () => {
            const registryNames = await dataProviderObject.getRegistries(TEST_REGION, schemaClient, testCredentials)
            assert.ok(registryNames!.length === 2, 'unexpected number of registries returned')
            assert.strictEqual(registryNames![0], TEST_REGISTRY, 'TEST_REGISTRY name should match')
            assert.strictEqual(registryNames![1], TEST_REGISTRY2, 'TEST_REGISTRY2 name should match')
        })

        it('should retain results when it is queried with same credentials ', async () => {
            await dataProviderObject.getRegistries(TEST_REGION, schemaClient, testCredentials)
            await dataProviderObject.getRegistries(TEST_REGION2, schemaClient, testCredentials)

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

            assert.strictEqual(regionData1.region, TEST_REGION)
            assert.strictEqual(regionData2.region, TEST_REGION2)

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

        it('should retain results when it is queried with different credentials ', async () => {
            await dataProviderObject.getRegistries(TEST_REGION, schemaClient, testCredentials)
            await dataProviderObject.getRegistries(TEST_REGION, schemaClient, testCredentials2)

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

        it('should return undefined when error occurs', async () => {
            sandbox.restore()
            sandbox
                .stub(schemaClient, 'listRegistries')
                .returns((new Error('Custom error') as any) as AsyncIterableIterator<RegistrySummary>)
            const result = await dataProviderObject.getRegistries(TEST_REGION, schemaClient, testCredentials)

            assert.strictEqual(result, undefined)
            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 0,
                'No data should be cached when error occurs'
            )
        })
    })

    describe('getSchemas', () => {
        it('should return schemas for given region', async () => {
            const schemas = await dataProviderObject.getSchemas(
                TEST_REGION,
                TEST_REGISTRY,
                schemaClient,
                testCredentials
            )

            assert.ok(schemas!.length === 2, 'Unexpected number of schemas returned')
            assert.strictEqual(schemas![0], schemaSummary, 'schemaSummary should match')
            assert.strictEqual(schemas![1], schemaSummary2, 'schemaSummary2 should match')
        })

        it('should retain results when it is queried with same credentials ', async () => {
            await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient, testCredentials)
            await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY2, schemaClient, testCredentials)

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

        it('should retain results when it is queried with different credentials ', async () => {
            await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient, testCredentials)
            await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient, testCredentials2)

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

        it('should return undefined when error occurs ', async () => {
            sandbox.restore()
            sandbox
                .stub(schemaClient, 'listSchemas')
                .returns((new Error('Custom error') as any) as AsyncIterableIterator<SchemaSummary>)
            const result = await dataProviderObject.getSchemas(
                TEST_REGION,
                TEST_REGISTRY,
                schemaClient,
                testCredentials
            )

            assert.strictEqual(result, undefined)
            assert.ok(
                cacheData.credentialsRegionDataList[0].regionDataList.length === 0,
                'No data should be cached when error occurs'
            )
        })
    })
})
