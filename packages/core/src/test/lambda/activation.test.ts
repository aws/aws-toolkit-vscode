/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LambdaFunctionNode } from '../../lambda/explorer/lambdaFunctionNode'
import * as treeNodeUtils from '../../shared/utilities/treeNodeUtils'
import * as resourceNode from '../../awsService/appBuilder/explorer/nodes/resourceNode'
import * as invokeLambdaModule from '../../lambda/vue/remoteInvoke/invokeLambda'
import * as tailLogGroupModule from '../../awsService/cloudWatchLogs/commands/tailLogGroup'
import { LogDataRegistry } from '../../awsService/cloudWatchLogs/registry/logDataRegistry'
import * as searchLogGroupModule from '../../awsService/cloudWatchLogs/commands/searchLogGroup'

const mockGeneratedLambdaNode: LambdaFunctionNode = {
    functionName: 'generatedFunction',
    regionCode: 'us-east-1',
    configuration: {
        FunctionName: 'generatedFunction',
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:generatedFunction',
    },
} as LambdaFunctionNode

const mockTreeNode = {
    resource: {
        deployedResource: { LogicalResourceId: 'TestFunction' },
        region: 'us-east-1',
        stackName: 'TestStack',
        resource: { Id: 'TestFunction', Type: 'AWS::Serverless::Function' },
    },
}

const mockLambdaNode: LambdaFunctionNode = {
    functionName: 'testFunction',
    regionCode: 'us-west-2',
    configuration: {
        FunctionName: 'testFunction',
        FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
        LoggingConfig: {
            LogGroup: '/aws/lambda/custom-log-group',
        },
    },
} as LambdaFunctionNode

describe('Lambda activation', () => {
    let sandbox: sinon.SinonSandbox
    let getSourceNodeStub: sinon.SinonStub
    let generateLambdaNodeFromResourceStub: sinon.SinonStub
    let invokeRemoteLambdaStub: sinon.SinonStub
    let tailLogGroupStub: sinon.SinonStub
    let isTreeNodeStub: sinon.SinonStub
    let searchLogGroupStub: sinon.SinonStub
    let registry: LogDataRegistry

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        searchLogGroupStub = sandbox.stub(searchLogGroupModule, 'searchLogGroup')
        registry = LogDataRegistry.instance
        getSourceNodeStub = sandbox.stub(treeNodeUtils, 'getSourceNode')
        generateLambdaNodeFromResourceStub = sandbox.stub(resourceNode, 'generateLambdaNodeFromResource')
        invokeRemoteLambdaStub = sandbox.stub(invokeLambdaModule, 'invokeRemoteLambda')
        tailLogGroupStub = sandbox.stub(tailLogGroupModule, 'tailLogGroup')
        isTreeNodeStub = sandbox.stub(require('../../shared/treeview/resourceTreeDataProvider'), 'isTreeNode')
    })

    afterEach(() => {
        sandbox.restore()
    })
    describe('aws.appBuilder.searchLogs command', () => {
        it('should handle LambdaFunctionNode directly', async () => {
            getSourceNodeStub.returns(mockLambdaNode)
            isTreeNodeStub.returns(false)
            searchLogGroupStub.resolves()

            const node = {}
            await vscode.commands.executeCommand('aws.appBuilder.searchLogs', node)

            assert(searchLogGroupStub.calledOnce)
            assert(
                searchLogGroupStub.calledWith(registry, 'AppBuilderSearchLogs', {
                    regionName: 'us-west-2',
                    groupName: '/aws/lambda/custom-log-group',
                })
            )
        })

        it('should generate LambdaFunctionNode from TreeNode when getSourceNode returns undefined', async () => {
            getSourceNodeStub.returns(undefined)
            isTreeNodeStub.returns(true)
            generateLambdaNodeFromResourceStub.resolves(mockGeneratedLambdaNode)
            searchLogGroupStub.resolves()

            await vscode.commands.executeCommand('aws.appBuilder.searchLogs', mockTreeNode)

            assert(generateLambdaNodeFromResourceStub.calledOnce)
            assert(generateLambdaNodeFromResourceStub.calledWith(mockTreeNode.resource))
            assert(searchLogGroupStub.calledOnce)
            assert(
                searchLogGroupStub.calledWith(registry, 'AppBuilderSearchLogs', {
                    regionName: 'us-east-1',
                    groupName: '/aws/lambda/generatedFunction',
                })
            )
        })

        it('should log error and throw ToolkitError when generateLambdaNodeFromResource fails', async () => {
            getSourceNodeStub.returns(undefined)
            isTreeNodeStub.returns(true)
            generateLambdaNodeFromResourceStub.rejects(new Error('Failed to generate node'))
            searchLogGroupStub.resolves()

            await vscode.commands.executeCommand('aws.appBuilder.searchLogs', mockTreeNode)
            assert(searchLogGroupStub.notCalled)
        })
    })

    describe('aws.invokeLambda command', () => {
        it('should handle LambdaFunctionNode directly from AWS Explorer', async () => {
            isTreeNodeStub.returns(false)
            invokeRemoteLambdaStub.resolves()

            await vscode.commands.executeCommand('aws.invokeLambda', mockLambdaNode)

            assert(invokeRemoteLambdaStub.calledOnce)
            const callArgs = invokeRemoteLambdaStub.getCall(0).args
            assert.strictEqual(callArgs[1].source, 'AwsExplorerRemoteInvoke')
            assert.strictEqual(callArgs[1].functionNode, mockLambdaNode)
        })

        it('should generate LambdaFunctionNode from TreeNode when coming from AppBuilder', async () => {
            isTreeNodeStub.returns(true)
            getSourceNodeStub.returns(undefined)
            generateLambdaNodeFromResourceStub.resolves(mockGeneratedLambdaNode)
            invokeRemoteLambdaStub.resolves()

            await vscode.commands.executeCommand('aws.invokeLambda', mockTreeNode)

            assert(generateLambdaNodeFromResourceStub.calledOnce)
            assert(generateLambdaNodeFromResourceStub.calledWith(mockTreeNode.resource))
            assert(invokeRemoteLambdaStub.calledOnce)
            const callArgs = invokeRemoteLambdaStub.getCall(0).args
            assert.strictEqual(callArgs[1].source, 'AppBuilderRemoteInvoke')
            assert.strictEqual(callArgs[1].functionNode, mockGeneratedLambdaNode)
        })

        it('should handle existing LambdaFunctionNode from TreeNode', async () => {
            const mockTreeNode = {
                resource: {},
            }

            isTreeNodeStub.returns(true)
            getSourceNodeStub.returns(mockLambdaNode)
            invokeRemoteLambdaStub.resolves()

            await vscode.commands.executeCommand('aws.invokeLambda', mockTreeNode)

            assert(generateLambdaNodeFromResourceStub.notCalled)
            assert(invokeRemoteLambdaStub.calledOnce)
            const callArgs = invokeRemoteLambdaStub.getCall(0).args
            assert.strictEqual(callArgs[1].source, 'AppBuilderRemoteInvoke')
            assert.strictEqual(callArgs[1].functionNode, mockLambdaNode)
        })
    })

    describe('aws.appBuilder.tailLogs command', () => {
        it('should handle LambdaFunctionNode directly', async () => {
            isTreeNodeStub.returns(false)
            getSourceNodeStub.returns(mockLambdaNode)
            tailLogGroupStub.resolves()

            await vscode.commands.executeCommand('aws.appBuilder.tailLogs', mockLambdaNode)

            assert(tailLogGroupStub.calledOnce)
            const callArgs = tailLogGroupStub.getCall(0).args
            assert.strictEqual(callArgs[1], 'AwsExplorerLambdaNode')
            assert.deepStrictEqual(callArgs[3], {
                regionName: 'us-west-2',
                groupName: '/aws/lambda/custom-log-group',
            })
            assert.deepStrictEqual(callArgs[4], { type: 'all' })
        })

        it('should generate LambdaFunctionNode from TreeNode when getSourceNode returns undefined', async () => {
            const mockGeneratedLambdaNode: LambdaFunctionNode = {
                functionName: 'generatedFunction',
                regionCode: 'us-east-1',
                configuration: {
                    FunctionName: 'generatedFunction',
                },
            } as LambdaFunctionNode

            isTreeNodeStub.returns(true)
            getSourceNodeStub.returns(undefined)
            generateLambdaNodeFromResourceStub.resolves(mockGeneratedLambdaNode)
            tailLogGroupStub.resolves()

            await vscode.commands.executeCommand('aws.appBuilder.tailLogs', mockTreeNode)

            assert(generateLambdaNodeFromResourceStub.calledOnce)
            assert(generateLambdaNodeFromResourceStub.calledWith(mockTreeNode.resource))
            assert(tailLogGroupStub.calledOnce)
            const callArgs = tailLogGroupStub.getCall(0).args
            assert.strictEqual(callArgs[1], 'AppBuilder')
            assert.deepStrictEqual(callArgs[3], {
                regionName: 'us-east-1',
                groupName: '/aws/lambda/generatedFunction',
            })
            assert.deepStrictEqual(callArgs[4], { type: 'all' })
        })

        it('should use correct source for TreeNode', async () => {
            const mockLambdaNode: LambdaFunctionNode = {
                functionName: 'testFunction',
                regionCode: 'us-west-2',
                configuration: {
                    FunctionName: 'testFunction',
                },
            } as LambdaFunctionNode

            const mockTreeNode = {
                resource: {},
            }

            isTreeNodeStub.returns(true)
            getSourceNodeStub.returns(mockLambdaNode)
            tailLogGroupStub.resolves()

            await vscode.commands.executeCommand('aws.appBuilder.tailLogs', mockTreeNode)

            assert(tailLogGroupStub.calledOnce)
            const callArgs = tailLogGroupStub.getCall(0).args
            assert.strictEqual(callArgs[1], 'AppBuilder')
        })
    })
})
