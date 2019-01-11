/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Uri } from 'vscode'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { ErrorNode } from '../../../lambda/explorer/errorNode'
import { RegionInfo } from '../../../shared/regions/regionInfo'

describe('ErrorNode', () => {

    const regionCode = 'us-east-1'
    const regionName = 'US East (N. Virginia)'

    const regionNode = new DefaultRegionNode(new RegionInfo(regionCode, regionName))
    const error = new Error('error message')
    error.name = 'myMockError'

    // Validates we tagged the node correctly
    it('initializes label and tooltip', async () => {

        const testNode = new ErrorNode(regionNode, error, 'Error loading resources')

        assert.strictEqual(testNode.label, 'Error loading resources')
        assert.strictEqual(testNode.tooltip, `${error.name}:${error.message}`)
    })

    // Validates we wired up the expected resource for the node icon
    it('initializes icon path', async () => {

        const fileScheme: string = 'file'
        const resourceImageName: string = 'error.svg'

        const testNode = new ErrorNode(regionNode, error, `Error loading resources (${error.name})`)

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

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = new ErrorNode(regionNode, error, `Error loading resources (${error.name})`)

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

})
