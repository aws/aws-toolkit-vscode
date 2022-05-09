/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Schemas } from 'aws-sdk'
import * as os from 'os'
import globals from '../../../shared/extensionGlobals'
import { RegistryItemNode } from '../../../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../../../eventSchemas/explorer/schemaItemNode'
import { SchemaClient } from '../../../shared/clients/schemaClient'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { MockSchemaClient, MockToolkitClientBuilder } from '../../shared/clients/mockClients'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'
import { asyncGenerator } from '../../utilities/collectionUtils'
import { assertNodeListOnlyContainsErrorNode } from '../../utilities/explorerNodeAssertions'

describe('SchemaItemNode', function () {
    let fakeSchemaItem: Schemas.SchemaSummary
    const fakeRegistryName = 'testRegistry'

    before(async function () {
        setupTestIconPaths()
        fakeSchemaItem = {
            SchemaName: 'testSchemaName',
            SchemaArn: 'testARN',
        }
    })

    after(async function () {
        clearTestIconPaths()
    })

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async function () {
        const testNode = generateTestNode()

        assert.strictEqual(testNode.label, fakeSchemaItem.SchemaName)
        assert.strictEqual(testNode.tooltip, `${fakeSchemaItem.SchemaName}${os.EOL}${fakeSchemaItem.SchemaArn}`)
    })

    it('initializes icon', async function () {
        const testNode = generateTestNode()

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, globals.iconPaths.dark.schema, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, globals.iconPaths.light.schema, 'Unexpected light icon path')
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    it('returns expected context value', async function () {
        const testNode = generateTestNode()

        assert.strictEqual(testNode.contextValue, 'awsSchemaItemNode')
    })

    // Validates schemaItem nodes are leaves
    it('has no children', async function () {
        const testNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

    function generateTestNode(): SchemaItemNode {
        return new SchemaItemNode(fakeSchemaItem, new MockSchemaClient(), fakeRegistryName)
    }
})

describe('RegistryItemNode', function () {
    const fakeRegion = 'testRegistry'
    let fakeRegistry: Schemas.RegistrySummary

    before(async function () {
        fakeRegistry = {
            RegistryName: 'testRegistry',
            RegistryArn: 'arn:aws:schemas:us-west-2:19930409:registry/testRegistry',
        }
    })

    class SchemaNamesMockSchemaClient extends MockSchemaClient {
        public constructor(
            public readonly schemaNames: string[] = [],
            listSchemas: (registryName: string) => AsyncIterableIterator<Schemas.SchemaSummary> = () => {
                return asyncGenerator<Schemas.SchemaSummary>(
                    schemaNames.map<Schemas.SchemaSummary>(name => {
                        return {
                            SchemaArn: name,
                            SchemaName: name,
                        }
                    })
                )
            }
        ) {
            super(undefined, undefined, listSchemas)
        }
    }

    class ThrowErrorRegistryItemNode extends RegistryItemNode {
        public constructor(regionCode: string, registryItemOutput: Schemas.RegistrySummary) {
            super(regionCode, registryItemOutput)
        }

        public async updateChildren(): Promise<void> {
            throw new Error('Hello there!')
        }
    }

    class TestMockToolkitClientBuilder extends MockToolkitClientBuilder {
        public constructor(schemaClient: SchemaClient) {
            super({ schemaClient })
        }
    }

    it('Sorts Schema Items By Name', async function () {
        const inputSchemaNames: string[] = ['zebra', 'Antelope', 'aardvark', 'elephant']
        const schemaClient = new SchemaNamesMockSchemaClient(inputSchemaNames)
        globals.toolkitClientBuilder = new TestMockToolkitClientBuilder(schemaClient)

        const registryItemNode = new RegistryItemNode(fakeRegion, fakeRegistry)
        const children = await registryItemNode.getChildren()

        assert.ok(children, 'Expected to get schemaItems as children')
        assert.strictEqual(
            inputSchemaNames.length,
            children.length,
            `Expected ${inputSchemaNames.length} RegistryItem children, got ${children.length}`
        )

        function assertChildNodeSchemaName(actualChildNode: AWSTreeNodeBase, expectedNodeText: string) {
            assert.strictEqual(
                'schemaName' in actualChildNode,
                true,
                'Child node expected to contain schemaName property'
            )

            const node: SchemaItemNode = actualChildNode as SchemaItemNode
            assert.strictEqual(
                node.schemaName,
                expectedNodeText,
                `Expected child node to have schema name ${expectedNodeText} but got ${node.schemaName}`
            )
        }

        assertChildNodeSchemaName(children[0], 'aardvark')
        assertChildNodeSchemaName(children[1], 'Antelope')
        assertChildNodeSchemaName(children[2], 'elephant')
        assertChildNodeSchemaName(children[3], 'zebra')
    })

    it('handles error', async function () {
        const testNode = new ThrowErrorRegistryItemNode(fakeRegion, fakeRegistry)

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })
})
