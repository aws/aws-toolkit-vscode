/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CloudFormation } from 'aws-sdk'
import * as os from 'os'
import {
    CloudFormationNode,
    CloudFormationStackNode,
    contextValueCloudformationLambdaFunction,
} from '../../../lambda/explorer/cloudFormationNodes'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { DefaultCloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'
import globals from '../../../shared/extensionGlobals'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { stub } from '../../utilities/stubber'
import { getLabel } from '../../../shared/treeview/utils'

const regionCode = 'someregioncode'

function createLambdaClient(...functionNames: string[]) {
    const client = stub(DefaultLambdaClient, { regionCode })
    client.listFunctions.returns(asyncGenerator(functionNames.map(name => ({ FunctionName: name }))))

    return client
}

function createCloudFormationClient(...stackNames: string[]) {
    const client = stub(DefaultCloudFormationClient, { regionCode })
    client.describeStackResources.resolves({ StackResources: [] })
    client.listStacks.returns(
        asyncGenerator(
            stackNames.map(name => {
                return {
                    StackId: name,
                    StackName: name,
                    CreationTime: new globals.clock.Date(),
                    StackStatus: 'CREATE_COMPLETE',
                }
            })
        )
    )

    return client
}

describe('CloudFormationStackNode', function () {
    function createStackSummary() {
        return {
            CreationTime: new globals.clock.Date(),
            StackId: '1',
            StackName: 'myStack',
            StackStatus: 'UPDATE_COMPLETE',
        }
    }

    function generateTestNode({
        summary = createStackSummary(),
        lambdaClient = createLambdaClient(),
        cloudFormationClient = createCloudFormationClient(),
    } = {}): CloudFormationStackNode {
        const parentNode = new TestAWSTreeNode('test node')

        return new CloudFormationStackNode(parentNode, regionCode, summary, lambdaClient, cloudFormationClient)
    }

    function generateStackResources(...functionNames: string[]): CloudFormation.StackResource[] {
        return functionNames.map(name => ({
            PhysicalResourceId: name,
            LogicalResourceId: name,
            ResourceStatus: 'CREATED',
            ResourceType: 'Lambda::Function',
            Timestamp: new globals.clock.Date(),
        }))
    }

    it('initializes name and tooltip', async function () {
        const summary = createStackSummary()
        const node = generateTestNode({ summary })
        assert.strictEqual(node.label, `${summary.StackName} [${summary.StackStatus}]`)
        assert.strictEqual(node.tooltip, `${summary.StackName}${os.EOL}${summary.StackId}`)
    })

    it('returns placeholder node if no children are present', async function () {
        const node = generateTestNode()
        const childNodes = await node.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has LambdaFunctionNode child nodes', async function () {
        const lambdaClient = createLambdaClient('function1', 'function2')
        const cloudFormationClient = createCloudFormationClient('foo')
        cloudFormationClient.describeStackResources.resolves({
            StackResources: generateStackResources('function1', 'function2'),
        })
        const node = generateTestNode({ lambdaClient, cloudFormationClient })
        const childNodes = await node.getChildren()

        assert.strictEqual(childNodes.length, 2, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof LambdaFunctionNode, 'Expected child node to be LambdaFunctionNode')
        )
    })

    it('has child nodes with CloudFormation contextValue', async function () {
        const lambdaClient = createLambdaClient('function1', 'function2')
        const cloudFormationClient = createCloudFormationClient('foo')
        cloudFormationClient.describeStackResources.resolves({
            StackResources: generateStackResources('function1', 'function2'),
        })
        const node = generateTestNode({ lambdaClient, cloudFormationClient })
        const childNodes = await node.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                contextValueCloudformationLambdaFunction,
                'expected the node to have a CloudFormation contextValue'
            )
        )
    })

    it('only includes functions which are in a CloudFormation stack', async function () {
        const lambdaClient = createLambdaClient('lambda3', 'lambda1')
        const cloudFormationClient = createCloudFormationClient('foo')
        cloudFormationClient.describeStackResources.resolves({
            StackResources: generateStackResources('lambda1', 'lambda2', 'lambda3'),
        })
        const node = generateTestNode({ lambdaClient, cloudFormationClient })
        const childNodes = await node.getChildren()

        assert.strictEqual(childNodes.length, 2, 'Unexpected child node count')

        assert.deepStrictEqual(
            new Set<string>(childNodes.map(node => getLabel(node))),
            new Set<string>(['lambda1', 'lambda3']),
            'Unexpected child sort order'
        )
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const cloudFormationClient = createCloudFormationClient()
        cloudFormationClient.describeStackResources.throws()

        const node = generateTestNode({ cloudFormationClient })
        assertNodeListOnlyHasErrorNode(await node.getChildren())
    })
})

describe('CloudFormationNode', function () {
    it('has CloudFormationStackNode child nodes', async function () {
        const client = createCloudFormationClient('stack123')
        const cloudFormationNode = new CloudFormationNode(regionCode, client)
        const children = await cloudFormationNode.getChildren()

        children.forEach(node =>
            assert.ok(node instanceof CloudFormationStackNode, 'Expected child node to be CloudFormationStackNode')
        )
    })

    it('has sorted child nodes', async function () {
        const client = createCloudFormationClient('b', 'a')
        const cloudFormationNode = new CloudFormationNode(regionCode, client)
        const children = await cloudFormationNode.getChildren()

        const actualChildOrder = children.map(node => (node as CloudFormationStackNode).stackName)
        assert.deepStrictEqual(actualChildOrder, ['a', 'b'], 'Unexpected child sort order')
    })

    it('returns placeholder node if no children are present', async function () {
        const client = createCloudFormationClient()
        const cloudFormationNode = new CloudFormationNode(regionCode, client)
        const children = await cloudFormationNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(children)
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createCloudFormationClient()
        client.listStacks.throws()
        const cloudFormationNode = new CloudFormationNode(regionCode, client)

        assertNodeListOnlyHasErrorNode(await cloudFormationNode.getChildren())
    })
})
