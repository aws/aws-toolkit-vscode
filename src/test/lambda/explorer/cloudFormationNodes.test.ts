/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import * as os from 'os'
import * as sinon from 'sinon'
import {
    CloudFormationNode,
    CloudFormationStackNode,
    CONTEXT_VALUE_CLOUDFORMATION_LAMBDA_FUNCTION,
} from '../../../lambda/explorer/cloudFormationNodes'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../../shared/utilities/iconPathUtils'
import { asyncGenerator } from '../../utilities/collectionUtils'
import {
    assertNodeListOnlyContainsErrorNode,
    assertNodeListOnlyContainsPlaceholderNode,
} from './explorerNodeAssertions'

const FAKE_REGION_CODE = 'someregioncode'
const UNSORTED_TEXT = ['zebra', 'Antelope', 'aardvark', 'elephant']
const SORTED_TEXT = ['aardvark', 'Antelope', 'elephant', 'zebra']

describe('CloudFormationStackNode', () => {
    let fakeStackSummary: CloudFormation.StackSummary
    let sandbox: sinon.SinonSandbox
    let testNode: CloudFormationStackNode

    // Mocked Lambda Client returns Lambda Functions for anything listed in lambdaFunctionNames
    let lambdaFunctionNames: string[]

    // Mocked CloudFormation Client returns Lambda Function Stack Resources for anything listed in cloudFormationStacklambdaFunctionNames
    let cloudFormationStacklambdaFunctionNames: string[]

    before(async () => {
        setupTestIconPaths()
        fakeStackSummary = {
            CreationTime: new Date(),
            StackId: '1',
            StackName: 'myStack',
            StackStatus: 'UPDATE_COMPLETE',
        }
    })

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        lambdaFunctionNames = ['function1', 'function2']
        cloudFormationStacklambdaFunctionNames = ['function1', 'function2']

        initializeClientBuilders()

        testNode = generateTestNode()
    })

    afterEach(() => {
        sandbox.restore()
    })

    after(async () => {
        clearTestIconPaths()
    })

    it('initializes name and tooltip', async () => {
        assert.strictEqual(testNode.label, `${fakeStackSummary.StackName} [${fakeStackSummary.StackStatus}]`)
        assert.strictEqual(testNode.tooltip, `${fakeStackSummary.StackName}${os.EOL}${fakeStackSummary.StackId}`)
    })

    it('initializes icon', async () => {
        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, ext.iconPaths.dark.cloudFormation, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, ext.iconPaths.light.cloudFormation, 'Unexpected light icon path')
    })

    it('returns placeholder node if no children are present', async () => {
        lambdaFunctionNames = []
        cloudFormationStacklambdaFunctionNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(childNodes)
    })

    it('has LambdaFunctionNode child nodes', async () => {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, cloudFormationStacklambdaFunctionNames.length, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof LambdaFunctionNode, 'Expected child node to be LambdaFunctionNode')
        )
    })

    it('has child nodes with CloudFormation contextValue', async () => {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(
                node.contextValue,
                CONTEXT_VALUE_CLOUDFORMATION_LAMBDA_FUNCTION,
                'expected the node to have a CloudFormation contextValue'
            )
        )
    })

    it('only includes functions which are in a CloudFormation stack', async () => {
        lambdaFunctionNames = ['lambda1', 'lambda2', 'lambda3']
        cloudFormationStacklambdaFunctionNames = ['lambda1', 'lambda3']

        const childNodes = await testNode.getChildren()
        assert.strictEqual(
            childNodes.length,
            cloudFormationStacklambdaFunctionNames.length,
            'Unexpected child node count'
        )

        assert.deepStrictEqual(
            new Set<string>(childNodes.map(node => node.label!)),
            new Set<string>(cloudFormationStacklambdaFunctionNames),
            'Unexpected child sort order'
        )
    })

    it('sorts child nodes', async () => {
        lambdaFunctionNames = UNSORTED_TEXT
        cloudFormationStacklambdaFunctionNames = UNSORTED_TEXT

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, SORTED_TEXT, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async () => {
        const lambdaClient = {
            listFunctions: sandbox.stub().callsFake(() => {
                throw new Error('loading failure')
            }),
        }

        const cloudFormationClient = {
            describeStackResources: sandbox.stub().callsFake(() => {
                throw new Error('loading failure')
            }),
        }

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient),
            createLambdaClient: sandbox.stub().returns(lambdaClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    function generateTestNode(): CloudFormationStackNode {
        const parentNode = new TestAWSTreeNode('test node')

        return new CloudFormationStackNode(parentNode, FAKE_REGION_CODE, fakeStackSummary)
    }

    function initializeClientBuilders() {
        const lambdaClient = {
            listFunctions: sandbox.stub().callsFake(() => {
                return asyncGenerator<Lambda.FunctionConfiguration>(
                    lambdaFunctionNames.map<Lambda.FunctionConfiguration>(name => {
                        return {
                            FunctionName: name,
                        }
                    })
                )
            }),
        }

        const cloudFormationClient = {
            describeStackResources: sandbox.stub().callsFake(() => {
                return {
                    StackResources: cloudFormationStacklambdaFunctionNames.map(name => {
                        return {
                            ResourceType: 'Lambda::Function',
                            PhysicalResourceId: name,
                        }
                    }),
                }
            }),
        }

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient),
            createLambdaClient: sandbox.stub().returns(lambdaClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})

describe('CloudFormationNode', () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('has CloudFormationStackNode child nodes', async () => {
        const inputStackNames: string[] = ['stack123']

        const cloudFormationClient = makeCloudFormationClient(inputStackNames)

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder

        const cloudFormationNode = new CloudFormationNode(FAKE_REGION_CODE)

        const children = await cloudFormationNode.getChildren()

        children.forEach(node =>
            assert.ok(node instanceof CloudFormationStackNode, 'Expected child node to be CloudFormationStackNode')
        )
    })

    it('has sorted child nodes', async () => {
        const inputStackNames = UNSORTED_TEXT
        const expectedChildOrder = SORTED_TEXT

        const cloudFormationClient = makeCloudFormationClient(inputStackNames)

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder

        const cloudFormationNode = new CloudFormationNode(FAKE_REGION_CODE)

        const children = await cloudFormationNode.getChildren()

        const actualChildOrder = children.map(node => (node as CloudFormationStackNode).stackName)

        assert.deepStrictEqual(actualChildOrder, expectedChildOrder, 'Unexpected child sort order')
    })

    it('returns placeholder node if no children are present', async () => {
        const cloudFormationClient = makeCloudFormationClient([])

        const clientBuilder = {
            createCloudFormationClient: sandbox.stub().returns(cloudFormationClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder

        const cloudFormationNode = new CloudFormationNode(FAKE_REGION_CODE)

        const children = await cloudFormationNode.getChildren()

        assertNodeListOnlyContainsPlaceholderNode(children)
    })

    it('has an error node for a child if an error happens during loading', async () => {
        const testNode = new CloudFormationNode(FAKE_REGION_CODE)
        sandbox.stub(testNode, 'updateChildren').callsFake(() => {
            throw new Error('Update Children error!')
        })

        const childNodes: AWSTreeNodeBase[] = await testNode.getChildren()
        assertNodeListOnlyContainsErrorNode(childNodes)
    })

    function makeCloudFormationClient(stackNames: string[]): any {
        return {
            listStacks: sandbox.stub().callsFake(() => {
                return asyncGenerator<CloudFormation.StackSummary>(
                    stackNames.map<CloudFormation.StackSummary>(name => {
                        return {
                            StackId: name,
                            StackName: name,
                            CreationTime: new Date(),
                            StackStatus: 'CREATE_COMPLETE',
                        }
                    })
                )
            }),
        }
    }
})
