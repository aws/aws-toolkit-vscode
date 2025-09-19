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

describe('Lambda activation', () => {
    let sandbox: sinon.SinonSandbox
    let getSourceNodeStub: sinon.SinonStub
    let generateLambdaNodeFromResourceStub: sinon.SinonStub
    let invokeRemoteLambdaStub: sinon.SinonStub
    let tailLogGroupStub: sinon.SinonStub
    let isTreeNodeStub: sinon.SinonStub

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        getSourceNodeStub = sandbox.stub(treeNodeUtils, 'getSourceNode')
        generateLambdaNodeFromResourceStub = sandbox.stub(resourceNode, 'generateLambdaNodeFromResource')
        invokeRemoteLambdaStub = sandbox.stub(invokeLambdaModule, 'invokeRemoteLambda')
        tailLogGroupStub = sandbox.stub(tailLogGroupModule, 'tailLogGroup')
        isTreeNodeStub = sandbox.stub(require('../../shared/treeview/resourceTreeDataProvider'), 'isTreeNode')
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('aws.invokeLambda command', () => {
        it('should handle LambdaFunctionNode directly from AWS Explorer', async () => {
            const mockLambdaNode: LambdaFunctionNode = {
                functionName: 'testFunction',
                regionCode: 'us-west-2',
                configuration: {
                    FunctionName: 'testFunction',
                    FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                },
            } as LambdaFunctionNode

            isTreeNodeStub.returns(false)
            invokeRemoteLambdaStub.resolves()

            await vscode.commands.executeCommand('aws.invokeLambda', mockLambdaNode)

            assert(invokeRemoteLambdaStub.calledOnce)
            const callArgs = invokeRemoteLambdaStub.getCall(0).args
            assert.strictEqual(callArgs[1].source, 'AwsExplorerRemoteInvoke')
            assert.strictEqual(callArgs[1].functionNode, mockLambdaNode)
        })

        it('should generate LambdaFunctionNode from TreeNode when coming from AppBuilder', async () => {
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
            const mockLambdaNode: LambdaFunctionNode = {
                functionName: 'existingFunction',
                regionCode: 'us-west-2',
                configuration: {
                    FunctionName: 'existingFunction',
                    FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:existingFunction',
                },
            } as LambdaFunctionNode

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
            const mockLambdaNode: LambdaFunctionNode = {
                functionName: 'testFunction',
                regionCode: 'us-west-2',
                configuration: {
                    FunctionName: 'testFunction',
                    LoggingConfig: {
                        LogGroup: '/aws/lambda/custom-log-group',
                    },
                },
            } as LambdaFunctionNode

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

            const mockTreeNode = {
                resource: {
                    deployedResource: { LogicalResourceId: 'TestFunction' },
                    region: 'us-east-1',
                    stackName: 'TestStack',
                    resource: { Id: 'TestFunction', Type: 'AWS::Serverless::Function' },
                },
            }

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
