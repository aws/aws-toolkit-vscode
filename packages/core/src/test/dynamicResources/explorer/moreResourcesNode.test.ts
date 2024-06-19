/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { ResourcesNode } from '../../../dynamicResources/explorer/nodes/resourcesNode'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { assertNodeListOnlyHasPlaceholderNode } from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { CloudFormation } from 'aws-sdk'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { Settings } from '../../../shared/settings'
import { ResourcesSettings } from '../../../dynamicResources/commands/configure'
import sinon from 'sinon'

const unsortedText = ['zebra', 'Antelope', 'aardvark', 'elephant']
const sortedText = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('ResourcesNode', function () {
    let settings: ResourcesSettings

    let testNode: ResourcesNode
    let mockCloudFormation: CloudFormationClient
    let mockCloudControl: CloudControlClient
    let resourceTypes: string[]

    before(async function () {
        mockCloudFormation = {} as any as CloudFormationClient
        mockCloudControl = {} as any as CloudControlClient
    })

    beforeEach(async function () {
        const workspaceSettings = new Settings(vscode.ConfigurationTarget.Workspace)
        settings = new ResourcesSettings(workspaceSettings)
        await settings.reset()
    })

    beforeEach(async function () {
        resourceTypes = ['type1', 'type2']
        prepareMock(resourceTypes)
        testNode = new ResourcesNode('FAKE_REGION', mockCloudFormation, mockCloudControl, settings)

        await setConfiguration(resourceTypes)
    })

    it('returns placeholder node if no resource types are enabled', async function () {
        const resourceTypes: string[] = []

        await setConfiguration(resourceTypes)

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has ResourceTypeNode child nodes', async function () {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, resourceTypes.length, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof ResourceTypeNode, 'Expected child node to be ResourceTypeNode')
        )
    })

    it('has child nodes with ResourceTypeNode contextValue', async function () {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue?.endsWith('ResourceTypeNode'),
                true,
                'expected the node to have a resourceTypeNode contextValue'
            )
        )
    })

    it('sorts child nodes', async function () {
        resourceTypes = unsortedText

        await setConfiguration(resourceTypes)

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
    })

    it('handles duplicate type entries without failing', async function () {
        prepareMock(['type1', 'type2', 'type1'])
        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, 2, 'Unexpected child count')
    })

    async function setConfiguration(resourceTypes: string[]) {
        await settings.update('enabledResources', resourceTypes)
    }

    function prepareMock(resourceTypes: string[]) {
        const listStub = sinon.stub().returns(
            asyncGenerator<CloudFormation.TypeSummary>(
                resourceTypes.map<CloudFormation.TypeSummary>(resourceType => {
                    return {
                        TypeName: resourceType,
                    }
                })
            )
        )
        mockCloudFormation.listTypes = listStub
    }
})
