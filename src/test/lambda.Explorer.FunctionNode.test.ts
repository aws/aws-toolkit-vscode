/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import { Uri } from 'vscode'
import { FunctionNode } from '../lambda/explorer/functionNode'
import { ext } from '../shared/extensionGlobals'
import { FakeExtensionContext } from './fakeExtensionContext'

suite('Lambda Explorer FunctionNode Tests', () => {

    let fakeFunctionConfig: Lambda.FunctionConfiguration

    class FakeExtensionContextOverride extends FakeExtensionContext {

        public asAbsolutePath(relativePath: string): string {
            return relativePath
        }
    }

    suiteSetup(function() {
        ext.context = new FakeExtensionContextOverride()
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN'
        }
    })

    // Validates we tagged the node correctly
    test('Function node name and tooltip are initialized', async () => {
        const testNode = new FunctionNode(fakeFunctionConfig, new Lambda())

        assert.equal(testNode.label, fakeFunctionConfig.FunctionName)
        assert.equal(testNode.tooltip, `${fakeFunctionConfig.FunctionName}-${fakeFunctionConfig.FunctionArn}`)
    })

    // Validates we wired up the expected resource for the node icon
    test('Function node iconPath member is initialized', async () => {

        const fileScheme: string = 'file'
        const resourceImageName: string = 'lambda_function.svg'

        const testNode = new FunctionNode(fakeFunctionConfig, new Lambda())

        const iconPath: any = testNode.iconPath
        assert(iconPath !== undefined)

        assert(iconPath.light !== undefined)
        assert(iconPath.light instanceof Uri)
        assert.equal(iconPath.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath.light.path
        assert(lightResourcePath.endsWith(`/light/${resourceImageName}`))

        assert(iconPath.dark !== undefined)
        assert(iconPath.dark instanceof Uri)
        assert.equal(iconPath.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath.dark.path
        assert(darkResourcePath.endsWith(`/dark/${resourceImageName}`))
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    test('Function node returns expected context value', async () => {
        const testNode = new FunctionNode(fakeFunctionConfig, new Lambda())

        assert.equal(testNode.contextValue, FunctionNode.contextValue)
    })

    // Validates function nodes are leaves
    test('Function node has no children', async () => {
        const testNode = new FunctionNode(fakeFunctionConfig, new Lambda())

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 0)
    })

})
