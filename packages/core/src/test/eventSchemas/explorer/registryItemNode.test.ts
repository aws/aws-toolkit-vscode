/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import * as sinon from 'sinon'
import { Schemas } from 'aws-sdk'
import { RegistryItemNode } from '../../../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../../../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../../../eventSchemas/explorer/schemasNode'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { getIcon } from '../../../shared/icons'
import { stub } from '../../utilities/stubber'

function createSchemaClient(data?: { schemas?: Schemas.SchemaSummary[]; registries?: Schemas.RegistrySummary[] }) {
    const client = stub(DefaultSchemaClient, { regionCode: 'code' })
    client.listSchemas.callsFake(() => asyncGenerator(data?.schemas ?? []))
    client.listRegistries.callsFake(() => asyncGenerator(data?.registries ?? []))

    return client
}

describe('RegistryItemNode', function () {
    let fakeRegistry: Schemas.RegistrySummary

    before(function () {
        fakeRegistry = {
            RegistryName: 'myRegistry',
            RegistryArn: 'arn:aws:schemas:us-west-2:434418839121:registry/myRegistry',
        }
    })

    // Validates we tagged the node correctly.
    it('initializes name, tooltip, and icon', async function () {
        const testNode: RegistryItemNode = generateTestNode()

        assert.strictEqual(testNode.label, `${fakeRegistry.RegistryName}`)
        assert.strictEqual(testNode.tooltip, `${fakeRegistry.RegistryName}${os.EOL}${fakeRegistry.RegistryArn}`)
        assert.strictEqual(testNode.iconPath, getIcon('aws-schemas-registry'))
    })

    it('returns placeholder node if no children are present', async function () {
        const testNode = generateTestNode()
        const childNodes = await testNode.getChildren()

        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PlaceholderNode, true)
    })

    it('returns schemas that belong to Registry', async function () {
        const schema1Item: Schemas.SchemaSummary = {
            SchemaArn: 'arn:schema1',
            SchemaName: 'schema1Name',
        }

        const schema2Item: Schemas.SchemaSummary = {
            SchemaArn: 'arn:schema1',
            SchemaName: 'schema2Name',
        }

        const schema3Item: Schemas.SchemaSummary = {
            SchemaArn: 'arn:schema1',
            SchemaName: 'schema3Name',
        }

        const schemaClient = createSchemaClient({ schemas: [schema1Item, schema2Item, schema3Item] })
        const testNode: RegistryItemNode = generateTestNode(schemaClient)

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

    function generateTestNode(client = createSchemaClient()): RegistryItemNode {
        return new RegistryItemNode(fakeRegistry, client)
    }
})

describe('DefaultRegistryNode', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('Sorts Registries', async function () {
        const inputRegistryNames: string[] = ['zebra', 'Antelope', 'aardvark', 'elephant']
        const client = createSchemaClient({
            registries: inputRegistryNames.map((name) => ({ RegistryName: name })),
        })

        const schemasNode = new SchemasNode(client)
        const children = await schemasNode.getChildren()

        assert.ok(children, 'Expected to get Registry node children')
        assert.strictEqual(
            inputRegistryNames.length,
            children.length,
            `Expected ${inputRegistryNames.length} Registry children, got ${children.length}`
        )

        function assertChildNodeRegistryName(actualChildNode: AWSTreeNodeBase, expectedNodeText: string) {
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

    it('returns placeholder node if no children are present', async function () {
        const schemasNode = new SchemasNode(createSchemaClient())
        const childNodes = await schemasNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('handles error', async function () {
        // typo in the name of the method
        class ThrowErrorDefaultSchemaRegistrynNode extends SchemasNode {
            public constructor() {
                super(createSchemaClient())
            }

            public override async updateChildren(): Promise<void> {
                throw new Error('Hello there!')
            }
        }

        const testNode: ThrowErrorDefaultSchemaRegistrynNode = new ThrowErrorDefaultSchemaRegistrynNode()

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyHasErrorNode(childNodes)
    })
})
