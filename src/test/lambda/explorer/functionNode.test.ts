/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import { Uri } from 'vscode'
import { RegionFunctionNode } from '../../../lambda/explorer/functionNode'
import { ext } from '../../../shared/extensionGlobals'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('FunctionNode', () => {

    let fakeFunctionConfig: Lambda.FunctionConfiguration

    class FakeExtensionContextOverride extends FakeExtensionContext {

        public asAbsolutePath(relativePath: string): string {
            return relativePath
        }
    }

    before(function() {
        ext.context = new FakeExtensionContextOverride()
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN'
        }
    })

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {
        const testNode = new RegionFunctionNode(
            undefined,
            {
                configuration: fakeFunctionConfig,
                client: new Lambda()
            }
        )

        assert.equal(testNode.label, fakeFunctionConfig.FunctionName)
        assert.equal(testNode.tooltip, `${fakeFunctionConfig.FunctionName}-${fakeFunctionConfig.FunctionArn}`)
    })

    // Validates we wired up the expected resource for the node icon
    it('initializes icon path', async () => {

        const fileScheme: string = 'file'
        const resourceImageName: string = 'lambda_function.svg'

        const testNode = new RegionFunctionNode(
            undefined,
            {
                configuration: fakeFunctionConfig,
                client: new Lambda()
            }
        )

        assert(testNode.iconPath !== undefined)
        const iconPath = testNode.iconPath! as {
            light: Uri,
            dark: Uri
        }

        assert(iconPath.light !== undefined)
        assert(iconPath.light instanceof Uri)
        assert.equal(iconPath.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath.light.path
        assert(lightResourcePath.endsWith(`/light/${resourceImageName}`))

        assert(iconPath.dark !== undefined)
        assert(iconPath.dark instanceof Uri)
        assert.equal(iconPath.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath.dark.path
        assert(darkResourcePath.endsWith(`dark/${resourceImageName}`))
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    it('returns expected context value', async () => {
        const testNode = new RegionFunctionNode(
            undefined,
            {
                configuration: fakeFunctionConfig,
                client: new Lambda()
            }
        )

        assert.equal(testNode.contextValue, 'awsRegionFunctionNode')
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = new RegionFunctionNode(
            undefined,
            {
                configuration: fakeFunctionConfig,
                client: new Lambda()
            }
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.equal(childNodes.length, 0)
    })

})
