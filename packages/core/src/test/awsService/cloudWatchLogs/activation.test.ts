/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getFunctionLogGroupName } from '../../../awsService/cloudWatchLogs/activation'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { LogDataRegistry } from '../../../awsService/cloudWatchLogs/registry/logDataRegistry'
import * as treeNodeUtils from '../../../shared/utilities/treeNodeUtils'
import * as resourceNode from '../../../awsService/appBuilder/explorer/nodes/resourceNode'
import * as searchLogGroupModule from '../../../awsService/cloudWatchLogs/commands/searchLogGroup'

describe('CloudWatchLogs activation', () => {
    let sandbox: sinon.SinonSandbox
    let getSourceNodeStub: sinon.SinonStub
    let generateLambdaNodeFromResourceStub: sinon.SinonStub
    let searchLogGroupStub: sinon.SinonStub
    let isTreeNodeStub: sinon.SinonStub
    let registry: LogDataRegistry

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        getSourceNodeStub = sandbox.stub(treeNodeUtils, 'getSourceNode')
        generateLambdaNodeFromResourceStub = sandbox.stub(resourceNode, 'generateLambdaNodeFromResource')
        searchLogGroupStub = sandbox.stub(searchLogGroupModule, 'searchLogGroup')
        isTreeNodeStub = sandbox.stub(require('../../../shared/treeview/resourceTreeDataProvider'), 'isTreeNode')
        registry = LogDataRegistry.instance
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('aws.appBuilder.searchLogs command', () => {
        it('should handle LambdaFunctionNode directly', async () => {
            const mockLambdaNode: LambdaFunctionNode = {
                regionCode: 'us-west-2',
                configuration: {
                    FunctionName: 'testFunction',
                    LoggingConfig: {
                        LogGroup: '/aws/lambda/custom-log-group',
                    },
                },
            } as LambdaFunctionNode

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
            const mockGeneratedLambdaNode: LambdaFunctionNode = {
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
            const mockTreeNode = {
                resource: {
                    deployedResource: { LogicalResourceId: 'TestFunction' },
                    region: 'us-east-1',
                    stackName: 'TestStack',
                    resource: { Id: 'TestFunction', Type: 'AWS::Serverless::Function' },
                },
            }

            getSourceNodeStub.returns(undefined)
            isTreeNodeStub.returns(true)
            generateLambdaNodeFromResourceStub.rejects(new Error('Failed to generate node'))
            searchLogGroupStub.resolves()

            await vscode.commands.executeCommand('aws.appBuilder.searchLogs', mockTreeNode)
            assert(searchLogGroupStub.notCalled)
        })
    })

    describe('getFunctionLogGroupName', () => {
        it('should return custom log group from LoggingConfig if present', () => {
            const configuration = {
                FunctionName: 'myFunction',
                LoggingConfig: {
                    LogGroup: '/custom/log/group',
                },
            }

            const result = getFunctionLogGroupName(configuration)
            assert.strictEqual(result, '/custom/log/group')
        })

        it('should return default log group path when LoggingConfig is not present', () => {
            const configuration = {
                FunctionName: 'myFunction',
            }

            const result = getFunctionLogGroupName(configuration)
            assert.strictEqual(result, '/aws/lambda/myFunction')
        })

        it('should return default log group path when LoggingConfig.LogGroup is undefined', () => {
            const configuration = {
                FunctionName: 'myFunction',
                LoggingConfig: {},
            }

            const result = getFunctionLogGroupName(configuration)
            assert.strictEqual(result, '/aws/lambda/myFunction')
        })
    })
})
