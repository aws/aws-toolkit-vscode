/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ResourcesNode } from '../../../dynamicResources/explorer/nodes/resourcesNode'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { assertNodeListOnlyContainsPlaceholderNode } from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../utilities/collectionUtils'
import { mock, instance, when } from 'ts-mockito'
import { CloudFormation } from 'aws-sdk'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'

const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('ResourcesNode', function () {
    let testNode: ResourcesNode
    let mockCloudFormation: CloudFormationClient
    let mockCloudControl: CloudControlClient
    let resourceTypes: string[]

    // These tests operate against the user's configuration.
    // Restore the initial value after testing is complete.
    let originalResourcesValue: any
    let settings: vscode.WorkspaceConfiguration

    before(async function () {
        settings = vscode.workspace.getConfiguration('aws.resources')
        originalResourcesValue = settings.get('enabledResources')
        mockCloudFormation = mock()
        mockCloudControl = mock()
    })

    after(async function () {
        await settings.update('enabledResources', originalResourcesValue, vscode.ConfigurationTarget.Global)
    })

    beforeEach(async function () {
        resourceTypes = ['type1', 'type2']
        prepareMock(resourceTypes)
        testNode = new ResourcesNode('FAKE_REGION', instance(mockCloudFormation), instance(mockCloudControl))

        await setConfiguration(resourceTypes)
    })

    it('returns placeholder node if no resource types are enabled', async function () {
        const resourceTypes: string[] = []

        await setConfiguration(resourceTypes)

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
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
        resourceTypes = UNSORTED_TEXT

        await setConfiguration(resourceTypes)

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, SORTED_TEXT, 'Unexpected child sort order')
    })

    async function setConfiguration(resourceTypes: string[]) {
        await settings.update('enabledResources', resourceTypes, vscode.ConfigurationTarget.Global)
    }

    function prepareMock(resourceTypes: string[]) {
        when(mockCloudFormation.listTypes()).thenReturn(
            asyncGenerator<CloudFormation.TypeSummary>(
                resourceTypes.map<CloudFormation.TypeSummary>(resourceType => {
                    return {
                        TypeName: resourceType,
                    }
                })
            )
        )
    }
})
