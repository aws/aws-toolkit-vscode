/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

//TODO: change the import to aws-sdk-js once Schemas SDK is launched
import * as Schemas from '../../../shared/schemas/clientschemas'

import * as os from 'os'
import { RegistryItemNode } from '../../../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../../../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../../../eventSchemas/explorer/schemasNode'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import { ext } from '../../../shared/extensionGlobals'
import { ErrorNode } from '../../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { assertNodeListOnlyContainsPlaceholderNode } from '../../lambda/explorer/explorerNodeAssertions'
import { MockSchemaClient, MockToolkitClientBuilder } from '../../shared/clients/mockClients'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'
import { asyncGenerator } from '../../utilities/collectionUtils'

describe('RegistryItemNode', () => {
    const fakeRegion = 'testRegion'
    let fakeRegistry: Schemas.RegistrySummary

    before(async () => {
        setupTestIconPaths()
        fakeRegistry = {
            RegistryName: 'myRegistry',
            RegistryArn: 'arn:aws:schemas:us-west-2:434418839121:registry/myRegistry'
        }
    })

    after(async () => {
        clearTestIconPaths()
    })

    class SchemaMockToolkitClientBuilder extends MockToolkitClientBuilder {
        public constructor(schemaClient: SchemaClient) {
            super(undefined, schemaClient)
        }
    }

    // Validates we tagged the node correctly.
    it('initializes name and tooltip', async () => {
        const testNode: RegistryItemNode = generateTestNode()

        assert.strictEqual(testNode.label, `${fakeRegistry.RegistryName}`)
        assert.strictEqual(testNode.tooltip, `${fakeRegistry.RegistryName}${os.EOL}${fakeRegistry.RegistryArn}`)
    })

    it('initializes icon', async () => {
        const testNode: RegistryItemNode = generateTestNode()

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.registry, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.registry, 'Unexpected light icon path')
    })

    it('returns placeholder node if no children are present', async () => {
        const schemaClient = ({
            regionCode: 'code',

            async *listSchemas(registryName: string, version: string): AsyncIterableIterator<Schemas.SchemaSummary> {
                yield* []
            }
        } as any) as SchemaClient

        ext.toolkitClientBuilder = new SchemaMockToolkitClientBuilder(schemaClient)
        const testNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PlaceholderNode, true)
    })

    it('returns schemas that belong to Registry', async () => {
        class TestMockSchemaClient extends MockSchemaClient {
            public constructor(
                public readonly schemaItemArray: Schemas.SchemaSummary[] = [],
                listSchemas: () => AsyncIterableIterator<Schemas.SchemaSummary> = () => {
                    return asyncGenerator<Schemas.SchemaSummary>(
                        schemaItemArray.map<Schemas.SchemaSummary>(schema => {
                            return {
                                SchemaArn: schema.SchemaArn,
                                SchemaName: schema.SchemaName
                            }
                        })
                    )
                }
            ) {
                super(undefined, undefined, listSchemas)
            }
        }

        const schema1Item: Schemas.SchemaSummary = {
            SchemaArn: 'arn:schema1',
            SchemaName: 'schema1Name'
        }

        const schema2Item: Schemas.SchemaSummary = {
            SchemaArn: 'arn:schema1',
            SchemaName: 'schema2Name'
        }

        const schema3Item: Schemas.SchemaSummary = {
            SchemaArn: 'arn:schema1',
            SchemaName: 'schema3Name'
        }

        const schemaItems: Schemas.SchemaSummary[] = [schema1Item, schema2Item, schema3Item]

        const schemaClient = new TestMockSchemaClient(schemaItems)
        ext.toolkitClientBuilder = new SchemaMockToolkitClientBuilder(schemaClient)
        const testNode: RegistryItemNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 3)

        assert(childNodes[0] instanceof SchemaItemNode)
        assert.strictEqual((childNodes[0] as SchemaItemNode).label, schema1Item.SchemaName)

        assert(childNodes[1] instanceof SchemaItemNode)
        assert.strictEqual((childNodes[1] as SchemaItemNode).label, schema2Item.SchemaName)

        assert(childNodes[1] instanceof SchemaItemNode)
        assert.strictEqual((childNodes[2] as SchemaItemNode).label, schema3Item.SchemaName)
    })

    function generateTestNode(): RegistryItemNode {
        return new RegistryItemNode(fakeRegion, fakeRegistry)
    }
})

describe('DefaultRegistryNode', () => {
    const fakeRegion: string = 'testRegion'

    class SchemaMockToolkitClientBuilder extends MockToolkitClientBuilder {
        public constructor(schemaClient: SchemaClient) {
            super(undefined, schemaClient)
        }
    }
    class RegistryNamesMockSchemaClient extends MockSchemaClient {
        public constructor(
            public readonly registryNames: string[] = [],
            listRegistries: () => AsyncIterableIterator<Schemas.RegistrySummary> = () => {
                return asyncGenerator<Schemas.RegistrySummary>(
                    registryNames.map<Schemas.RegistrySummary>(name => {
                        return {
                            RegistryName: name
                        }
                    })
                )
            }
        ) {
            super(undefined, listRegistries)
        }
    }

    it('Sorts Registries', async () => {
        const inputRegistryNames: string[] = ['zebra', 'Antelope', 'aardvark', 'elephant']
        const schemaClient = new RegistryNamesMockSchemaClient(inputRegistryNames)
        ext.toolkitClientBuilder = new SchemaMockToolkitClientBuilder(schemaClient)

        const schemasNode = new SchemasNode(fakeRegion)
        const children = await schemasNode.getChildren()

        assert.ok(children, 'Expected to get Registry node children')
        assert.strictEqual(
            inputRegistryNames.length,
            children.length,
            `Expected ${inputRegistryNames.length} Registry children, got ${children.length}`
        )

        function assertChildNodeRegistryName(
            actualChildNode: RegistryItemNode | ErrorNode | PlaceholderNode,
            expectedNodeText: string
        ) {
            assert.strictEqual(actualChildNode instanceof RegistryItemNode, true, 'Child node was not a Registry Node')

            const node: RegistryItemNode = actualChildNode as RegistryItemNode
            assert.strictEqual(
                node.registryName,
                expectedNodeText,
                `Expected child node to have registry ${expectedNodeText} but got ${node.registryName}`
            )
        }

        assertChildNodeRegistryName(children[0], 'aardvark')
        assertChildNodeRegistryName(children[1], 'Antelope')
        assertChildNodeRegistryName(children[2], 'elephant')
        assertChildNodeRegistryName(children[3], 'zebra')
    })

    it('returns placeholder node if no children are present', async () => {
        const inputRegistryNames: string[] = []
        const schemaClient = new RegistryNamesMockSchemaClient(inputRegistryNames)
        ext.toolkitClientBuilder = new SchemaMockToolkitClientBuilder(schemaClient)

        const schemasNode = new SchemasNode(fakeRegion)
        const childNodes = await schemasNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('handles error', async () => {
        //typo in the name of the method
        class ThrowErrorDefaultSchemaRegistrynNode extends SchemasNode {
            public constructor() {
                super(fakeRegion)
            }

            public async updateChildren(): Promise<void> {
                throw new Error('Hello there!')
            }
        }

        const testNode: ThrowErrorDefaultSchemaRegistrynNode = new ThrowErrorDefaultSchemaRegistrynNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
