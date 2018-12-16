/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CloudFormation, Lambda } from 'aws-sdk'
import { Uri } from 'vscode'
import { CloudFormationNode } from '../../../lambda/explorer/cloudFormationNode'
import { FunctionNode } from '../../../lambda/explorer/functionNode'
import { NoFunctionsNode } from '../../../lambda/explorer/noFunctionsNode'
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
        assert.equal(childNodes[0] instanceof NoFunctionsNode, true)
    })

    // Validates that only cloudformation stack lambdas are present
    it('only specific cloudformation stack lambdas', async () => {

        const lambda1 = new FunctionNode({
                                            FunctionName: 'lambda1Name',
                                            FunctionArn: 'lambda1ARN'
                                         },
                                         new Lambda())
        const lambda2 = new FunctionNode({
                                            FunctionName: 'lambda2Name',
                                            FunctionArn: 'lambda2ARN'
                                         },
                                         new Lambda())
        const lambda3 = new FunctionNode({
                                            FunctionName: 'lambda3Name',
                                            FunctionArn: 'lambda3ARN'
                                         },
                                         new Lambda())

        const testNode =
            new CloudFormationNode(fakeStackSummary, new CloudFormation(),
                                   [lambda1, lambda2, lambda3])
        testNode.stackDescribed = true
        testNode.lambdaResources.push('lambda1Name')
        testNode.lambdaResources.push('lambda3Name')

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 2)

        assert(childNodes[0] instanceof FunctionNode)
        assert.equal((childNodes[0] as FunctionNode).label, lambda1.label)

        assert(childNodes[1] instanceof FunctionNode)
        assert.equal((childNodes[1] as FunctionNode).label, lambda3.label)
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
