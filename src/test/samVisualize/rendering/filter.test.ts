/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { join } from 'path'
import { readFileSync, readdirSync } from 'fs'
import { getProjectDir } from '../../testUtil'
import { filterPrimaryOnly } from '../../../samVisualize/rendering/filter'

const primaryResourceListPath = join(
    getProjectDir(),
    '..',
    '..',
    'resources',
    'light',
    'samVisualize',
    'resources.json'
)
const graphObjectsDir = join(
    getProjectDir(),
    'testFixtures',
    'workspaceFolder',
    'samVisualize-test-data',
    'expectedGraphObjects'
)
let primaryResourceList: Array<string>
let graphObjectFiles: Array<string>
describe('filterPrimaryOnly', function () {
    before(function () {
        const resourceCategories = JSON.parse(readFileSync(primaryResourceListPath).toString())
        primaryResourceList = resourceCategories.primaryResources
        graphObjectFiles = readdirSync(graphObjectsDir)
    })

    it('Given a complete GraphObject, correctly produces a GraphObject containing only primary nodes and links between primary nodes', function () {
        for (const file of graphObjectFiles) {
            const graphObject = JSON.parse(readFileSync(join(graphObjectsDir, file)).toString())
            const primaryResourceSet = new Set<string>(primaryResourceList)

            const primaryOnlyGraphObject = filterPrimaryOnly(graphObject, primaryResourceSet)

            // Ensure all nodes in primaryOnlyGraphObject are of a primary type, specified by primaryResourceSet
            const primaryNodeNameSet = new Set<string>()
            for (const node of primaryOnlyGraphObject.nodes) {
                assert.ok(node.type)
                assert.strictEqual(primaryResourceSet.has(node.type), true)
                primaryNodeNameSet.add(node.name)
            }

            // Ensure all links in primaryOnlyGraphObject are between primary nodes
            for (const link of primaryOnlyGraphObject.links) {
                assert.strictEqual(primaryNodeNameSet.has(link.source), true)
                assert.strictEqual(primaryNodeNameSet.has(link.target), true)
            }
        }
    })
})
