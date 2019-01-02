/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import { Uri } from 'vscode'
import { CloudFormationNode } from '../../../lambda/explorer/cloudFormationNode'
import { CloudFormationFunctionNode } from '../../../lambda/explorer/functionNode'
import { PlaceholderNode } from '../../../lambda/explorer/placeholderNode'
import { ext } from '../../../shared/extensionGlobals'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('CloudFormationNode', () => {

    let fakeStackSummary: CloudFormation.StackSummary

    class FakeExtensionContextOverride extends FakeExtensionContext {

        public asAbsolutePath(relativePath: string): string {
            return relativePath
        }
    }

    before(function() {
        ext.context = new FakeExtensionContextOverride()
        fakeStackSummary = {
            CreationTime: new Date(),
            StackId: '1',
            StackName: 'myStack',
            StackStatus: 'UPDATE_COMPLETE'
        }
    })

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {
        const testNode =
            new CloudFormationNode(fakeStackSummary, new CloudFormation(), [])

        assert.equal(testNode.label, `${fakeStackSummary.StackName} [${fakeStackSummary.StackStatus}]`)
        assert.equal(testNode.tooltip, `${fakeStackSummary.StackName}-${fakeStackSummary.StackId}`)
    })

    // Validates minimum children number
    it('minimum children number', async () => {

        const testNode =
            new CloudFormationNode(fakeStackSummary, new CloudFormation(), [])

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 1)
        assert.equal(childNodes[0] instanceof PlaceholderNode, true)
    })

    // Validates that only cloudformation stack lambdas are present
    it('only specific cloudformation stack lambdas', async () => {

        class DerivedCloudFormationNode extends CloudFormationNode {

            public setStackDescribed(value: boolean) {
                this.stackDescribed = value
            }

            public addLambdaResource(lambdaName: string) {
                this.lambdaResources = this.lambdaResources || []
                this.lambdaResources.push(lambdaName)
            }

        }

        const lambda1 = {
            configuration: {
                FunctionName: 'lambda1Name',
                FunctionArn: 'lambda1ARN'
            },
            client: new Lambda()
        }
        const lambda2 = {
            configuration: {
                FunctionName: 'lambda2Name',
                FunctionArn: 'lambda2ARN'
            },
            client: new Lambda()
        }
        const lambda3 = {
            configuration: {
                FunctionName: 'lambda3Name',
                FunctionArn: 'lambda3ARN'
            },
            client: new Lambda()
        }

        const testNode =
            new DerivedCloudFormationNode(fakeStackSummary, new CloudFormation(),
                                          [lambda1, lambda2, lambda3])
        testNode.setStackDescribed(true)
        testNode.addLambdaResource('lambda1Name')
        testNode.addLambdaResource('lambda3Name')

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 2)

        assert(childNodes[0] instanceof CloudFormationFunctionNode)
        assert.equal((childNodes[0] as CloudFormationFunctionNode).label, lambda1.configuration.FunctionName)

        assert(childNodes[1] instanceof CloudFormationFunctionNode)
        assert.equal((childNodes[1] as CloudFormationFunctionNode).label, lambda3.configuration.FunctionName)
    })

    // Validates we wired up the expected resource for the node icon
    it('initializes icon path', async () => {

        const fileScheme: string = 'file'
        const resourceImageName: string = 'cloudformation.svg'

        const testNode =
            new CloudFormationNode(fakeStackSummary, new CloudFormation(), [])

        const iconPath = testNode.iconPath
        assert(iconPath !== undefined)

        assert(iconPath!.light !== undefined)
        assert(iconPath!.light instanceof Uri)
        assert.equal(iconPath!.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath!.light.path
        assert(lightResourcePath.endsWith(`/light/${resourceImageName}`))

        assert(iconPath!.dark !== undefined)
        assert(iconPath!.dark instanceof Uri)
        assert.equal(iconPath!.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath!.dark.path
        assert(darkResourcePath.endsWith(`dark/${resourceImageName}`))
    })

})
