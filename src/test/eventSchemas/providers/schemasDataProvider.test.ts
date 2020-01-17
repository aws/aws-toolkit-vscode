/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { SchemasDataProvider } from '../../../eventSchemas/providers/schemasDataProvider'
import { MockSchemaClient } from '../../shared/clients/mockClients'
import { asyncGenerator } from '../../utilities/collectionUtils'

describe('getRegistries', () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    const TEST_REGION = 'testRegion'
    const TEST_REGISTRY = 'testRegistry'
    const TEST_REGISTRY2 = 'testRegistry2'

    const TEST_SCHEMA = 'testSchema'
    const TEST_SCHEMA2 = 'testSchema2'

    const schemaClient = new MockSchemaClient(TEST_REGION)

    it('should return registries for given region', async () => {
        const registrySummary1 = { RegistryArn: 'arn:aws:registry/' + TEST_REGISTRY, RegistryName: TEST_REGISTRY }
        const registrySummary2 = { RegistryArn: 'arn:aws:registry/' + TEST_REGISTRY2, RegistryName: TEST_REGISTRY2 }

        sandbox.stub(schemaClient, 'listRegistries').returns(asyncGenerator([registrySummary1, registrySummary2]))

        const registryNames = await SchemasDataProvider.getInstance().getRegistries(TEST_REGION, schemaClient)

        assert.ok(registryNames.length === 2, 'Should be two registries')
        assert.strictEqual(registryNames[0], TEST_REGISTRY, 'TEST_REGISTRY name should match')
        assert.strictEqual(registryNames[1], TEST_REGISTRY2, 'TEST_REGISTRY2 name should match')
    })

    it('should retain results once it is queried ', async () => {
        const cachedResults = SchemasDataProvider.getInstance().getCachedRegionMap()

        assert.ok(cachedResults.length === 1, 'Should be one region in the cache')
        assert.strictEqual(cachedResults[0].region, TEST_REGION)

        assert.ok(cachedResults[0].registryNames.length === 2, 'Unexpected number of registryNames returned')
        assert.strictEqual(cachedResults[0].registryNames[0], TEST_REGISTRY)
        assert.strictEqual(cachedResults[0].registryNames[1], TEST_REGISTRY2)

        assert.deepStrictEqual(
            cachedResults[0].registrySchemasMapList,
            [],
            'Region should have no registrySchemasMapList'
        )
    })

    it('should retrieve registries from cache ', async () => {
        const registryNames = await SchemasDataProvider.getInstance().getRegistries(TEST_REGION, schemaClient)
        assert.strictEqual(registryNames[0], TEST_REGISTRY, 'TEST_REGISTRY names should match')
        assert.strictEqual(registryNames[1], TEST_REGISTRY2, 'TEST_REGISTRY2 name should match')
    })

    describe('getSchemas', () => {
        const schemaSummary = { SchemaName: TEST_SCHEMA }
        const schemaSummary2 = { SchemaName: TEST_SCHEMA2 }

        it('should return schemas for given region', async () => {
            sandbox.stub(schemaClient, 'listSchemas').returns(asyncGenerator([schemaSummary, schemaSummary2]))
            const schemas = await SchemasDataProvider.getInstance().getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient)

            assert.ok(schemas!.length === 2, 'Unexpected number of schemas returned')
            assert.strictEqual(schemas![0], schemaSummary, 'schemaSummary should match')
            assert.strictEqual(schemas![1], schemaSummary2, 'schemaSummary2 should match')
        })

        it('should retain results once it is queried ', async () => {
            const cachedResults = SchemasDataProvider.getInstance().getCachedRegionMap()

            assert.ok(
                cachedResults[0].registrySchemasMapList.length === 1,
                'Unexpected number of elements returned in registrySchemasMapList'
            )
            assert.deepStrictEqual(
                cachedResults[0].registrySchemasMapList[0].schemaList,
                [schemaSummary, schemaSummary2],
                'Single queried registry should have two schemas'
            )
        })

        it('should retrieve schemas from cache ', async () => {
            const schemas = await SchemasDataProvider.getInstance().getSchemas(TEST_REGION, TEST_REGISTRY, schemaClient)

            assert.strictEqual(schemas![0], schemaSummary, 'schemaSummary should match')
            assert.strictEqual(schemas![1], schemaSummary2, 'schemaSummary2 should match')
        })
    })
})
