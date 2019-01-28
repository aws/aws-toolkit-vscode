/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import { Uri } from 'vscode'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { ErrorNode } from '../../../lambda/explorer/errorNode'
import {
    DefaultStandaloneFunctionGroupNode,
    DefaultStandaloneFunctionNode
} from '../../../lambda/explorer/standaloneNodes'
import { ext } from '../../../shared/extensionGlobals'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('DefaultStandaloneFunctionNode', () => {

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
        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        assert.strictEqual(testNode.label, fakeFunctionConfig.FunctionName)
        assert.strictEqual(testNode.tooltip, `${fakeFunctionConfig.FunctionName}-${fakeFunctionConfig.FunctionArn}`)
    })

    // Validates we wired up the expected resource for the node icon
    it('initializes icon path', async () => {

        const fileScheme: string = 'file'
        const resourceImageName: string = 'lambda_function.svg'

        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        assert(testNode.iconPath !== undefined)
        const iconPath = testNode.iconPath! as {
            light: Uri,
            dark: Uri
        }

        assert(iconPath.light !== undefined)
        assert(iconPath.light instanceof Uri)
        assert.strictEqual(iconPath.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath.light.path
        assert(lightResourcePath.endsWith(`/light/${resourceImageName}`))

        assert(iconPath.dark !== undefined)
        assert(iconPath.dark instanceof Uri)
        assert.strictEqual(iconPath.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath.dark.path
        assert(darkResourcePath.endsWith(`dark/${resourceImageName}`))
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    it('returns expected context value', async () => {
        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        assert.strictEqual(testNode.contextValue, 'awsRegionFunctionNode')
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(new DefaultRegionNode(new RegionInfo('code', 'name'))),
            fakeFunctionConfig
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

})

describe('DefaultStandaloneFunctionGroupNode', () => {

    class ThrowErrorDefaultStandaloneFunctionGroupNode extends DefaultStandaloneFunctionGroupNode {
        public constructor(
            public readonly parent: DefaultRegionNode
        ) {
            super(parent)
        }

        public async updateChildren(): Promise<void> {
            throw new Error('Hello there!')
        }
    }

    it('handles error', async () => {
        const testNode = new ThrowErrorDefaultStandaloneFunctionGroupNode(
            new DefaultRegionNode(new RegionInfo('code', 'name')))

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
