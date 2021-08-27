/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { generateGraphFromYaml } from '../../../samVisualize/graphGeneration/cfnTemplateGraphGenerator'
import { Node, Link } from '../../../samVisualize/graphGeneration/graph'
import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'
import { getProjectDir } from '../../testUtil'
import { trimExtension } from '../../../shared/utilities/pathUtils'

const testInputDirectory = join(
    getProjectDir(),
    'testFixtures',
    'workspaceFolder',
    'samVisualize-test-data',
    'testYamlTemplates'
)
const testExpectedOutputDirectory = join(
    getProjectDir(),
    'testFixtures',
    'workspaceFolder',
    'samVisualize-test-data',
    'expectedGraphObjects'
)

// Holds incorrect CFN templates to test error cases
const errorInputDirectory = join(
    getProjectDir(),
    'testFixtures',
    'workspaceFolder',
    'samVisualize-test-data',
    'notCFNTemplates'
)

let inputFiles: Array<string>
let expectedOutputFiles: Array<string>
let errorFiles: Array<string>

describe('samVisualize Graph Generation from YAML', async function () {
    /**
     * Sorts Node objects lexigraphically by name.
     * No two Nodes in a graph will have the same name (no need to compare Node type)
     */
    function nodeAlphaCompare(n1: Node, n2: Node) {
        return n1.name > n2.name ? 1 : -1
    }

    /**
     * Sorts Link objects lexigraphically first by source, then by target, and finally by type.
     */
    function linkAlphaCompare(l1: Link, l2: Link) {
        if (l1.source === l2.source) {
            if (l1.target === l2.target) {
                if (l1.type === l2.type) {
                    return 0
                }
                // undefined gets placed after any value
                if (l1.type === undefined) {
                    return -1
                }
                if (l2.type === undefined) {
                    return 1
                }
                return l1.type > l2.type ? 1 : -1
            }
            return l1.target > l2.target ? 1 : -1
        }
        return l1.source > l2.source ? 1 : -1
    }

    before(function () {
        inputFiles = readdirSync(testInputDirectory)
        expectedOutputFiles = readdirSync(testExpectedOutputDirectory)
        errorFiles = readdirSync(errorInputDirectory)
    })

    it('generates correct graph from YAML CFN Template', function () {
        assert.strictEqual(
            inputFiles.length,
            expectedOutputFiles.length,
            'Must have same number of test yaml templates and expected GraphObjects'
        )
        // Input files are YAML or JSON
        // Output files are JSON
        for (const file of inputFiles) {
            const inputFile = join(testInputDirectory, file)
            const expectedOutputFile = join(testExpectedOutputDirectory, trimExtension(file) + '.json')

            const yamlString = readFileSync(inputFile).toString()
            const outputObject = generateGraphFromYaml(yamlString, './test/path')
            const expectedObject = JSON.parse(readFileSync(expectedOutputFile).toString())

            /**
             * Ensure that node & link lists match expected output.
             * Each list is sorted the same way such that they can be
             * deeply compared regardless of their initial order.
             */

            assert.ok(outputObject)
            const outputNodes = outputObject.nodes.sort(nodeAlphaCompare)
            const outputLinks = outputObject.links.sort(linkAlphaCompare)
            const expectedNodes = expectedObject.nodes.sort(nodeAlphaCompare)
            const expectedLinks = expectedObject.links.sort(linkAlphaCompare)

            assert.deepStrictEqual(outputNodes, expectedNodes, `In ${file}`)
            assert.deepStrictEqual(outputLinks, expectedLinks, `In ${file}`)
        }
    })
    // Note: A valid CFN template is defined here: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html
    it('gracefully returns undefined when input is valid yaml but not a valid CFN Template', function () {
        for (const file of errorFiles) {
            const errorFile = join(errorInputDirectory, file)
            const badCFNTemplateString = readFileSync(errorFile).toString()

            assert.strictEqual(generateGraphFromYaml(badCFNTemplateString, './test/path'), undefined)
        }
    })
})
