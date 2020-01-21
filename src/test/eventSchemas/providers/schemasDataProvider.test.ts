/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { RegistrySummary, SchemaSummary } from 'aws-sdk/clients/schemas'
import * as sinon from 'sinon'
import { Cache, regionRegistryMap, SchemasDataProvider } from '../../../eventSchemas/providers/schemasDataProvider'
import { MockSchemaClient } from '../../shared/clients/mockClients'
import { asyncGenerator } from '../../utilities/collectionUtils'

describe('schemasDataProvider', () => {
    let sandbox: sinon.SinonSandbox
    let dataProviderObject: SchemasDataProvider
    let regionDataList: regionRegistryMap[]
    let cacheData: Cache

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        regionDataList = []
        cacheData = new Cache(regionDataList)
        dataProviderObject = new SchemasDataProvider(testCredentials, cacheData)
        sandbox.stub(schemaClient, 'listRegistries').returns(asyncGenerator([registrySummary1, registrySummary2]))
        sandbox.stub(schemaClient, 'listSchemas').returns(asyncGenerator([schemaSummary, schemaSummary2]))
    })

    afterEach(() => {
        sandbox.restore()
    })

    const TEST_REGION = 'testRegion'
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

    describe('getRegistries', () => {
        it('should return registries for given region', async () => {
            const registryNames = await dataProviderObject.getRegistries(TEST_REGION, schemaClient)
            assert.ok(registryNames!.length === 2, 'unexpected number of registries returned')
            assert.strictEqual(registryNames![0], TEST_REGISTRY, 'TEST_REGISTRY name should match')
            assert.strictEqual(registryNames![1], TEST_REGISTRY2, 'TEST_REGISTRY2 name should match')
        })

        it('should retain results once it is queried ', async () => {
            await dataProviderObject.getRegistries(TEST_REGION, schemaClient)
            assert.ok(regionDataList.length === 1, 'Cache should contain data for a single region')
            assert.strictEqual(regionDataList[0].region, TEST_REGION)

            assert.ok(regionDataList[0].registryNames.length === 2, 'Two registryNames should be stored in cache')
            assert.strictEqual(regionDataList[0].registryNames[0], TEST_REGISTRY)
            assert.strictEqual(regionDataList[0].registryNames[1], TEST_REGISTRY2)

            assert.deepStrictEqual(
                regionDataList[0].registrySchemasMapList,
                [],
                'Cache should have an empty registrySchemasMapList'
            )
        })

        it('should return undefined when error occurs', async () => {
            sandbox.restore()
            sandbox
                .stub(schemaClient, 'listRegistries')
                .returns((new Error('Custom error') as any) as AsyncIterableIterator<RegistrySummary>)
            const result = await dataProviderObject.getRegistries(TEST_REGION, schemaClient)

            assert.strictEqual(result, undefined)
            assert.ok(regionDataList.length === 0, 'No data should be cached when error occurs')
        })
    })

    describe('getSchemas', () => {
        it('should return schemas for given region', async () => {
            const schemas = await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient)

            assert.ok(schemas!.length === 2, 'Unexpected number of schemas returned')
            assert.strictEqual(schemas![0], schemaSummary, 'schemaSummary should match')
            assert.strictEqual(schemas![1], schemaSummary2, 'schemaSummary2 should match')
        })

        it('should retain results once it is queried ', async () => {
            await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient)

            assert.ok(regionDataList.length === 1, 'Cache should contain data for a single region')
            assert.ok(
                regionDataList[0].registrySchemasMapList.length === 1,
                'There should be a single element in registrySchemasMapList'
            )
            assert.deepStrictEqual(
                regionDataList[0].registrySchemasMapList[0].schemaList,
                [schemaSummary, schemaSummary2],
                'Single queried registry should have two schemas'
            )
        })

        it('should return undefined when error occurs ', async () => {
            sandbox.restore()
            sandbox
                .stub(schemaClient, 'listSchemas')
                .returns((new Error('Custom error') as any) as AsyncIterableIterator<SchemaSummary>)
            const result = await dataProviderObject.getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient)

            assert.strictEqual(result, undefined)
            assert.ok(regionDataList.length === 0, 'No data should be cached when error occurs')
        })
    })

    describe('getInstance', () => {
        let regionDataList2: regionRegistryMap[]
        let cacheData2: Cache
        const testCredentials2 = ({} as any) as AWS.Credentials
        regionDataList2 = []
        cacheData2 = new Cache(regionDataList2)

        it('should return same instance when it is invoked with same credentials', async () => {
            await SchemasDataProvider.getInstance(testCredentials, cacheData).getRegistries(TEST_REGION, schemaClient)
            await SchemasDataProvider.getInstance(testCredentials, cacheData2).getRegistries(TEST_REGION, schemaClient)

            assert.ok(regionDataList.length === 1, 'Should be one region in the cache')
            assert.strictEqual(regionDataList[0].region, TEST_REGION)
            assert.ok(regionDataList2.length === 0, 'Nothing stored in the second cache2 object')
        })

        it('should return new instance when it is invoked with new credentials', async () => {
            await SchemasDataProvider.getInstance(testCredentials, cacheData).getRegistries(TEST_REGION, schemaClient)
            await SchemasDataProvider.getInstance(testCredentials2, cacheData2).getRegistries(TEST_REGION, schemaClient)

            assert.ok(regionDataList.length === 0, 'Nothing stored in the first cache object')
            assert.ok(regionDataList2.length === 1, 'Should be one region in the second cache2 object')
            assert.strictEqual(regionDataList2[0].region, TEST_REGION)
        })
    })
})
