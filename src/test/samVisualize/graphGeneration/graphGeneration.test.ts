/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { generateGraphFromYaml } from '../../../samVisualize/graphGeneration/cfnTemplateGraphGenerator'
import { Node, Link } from '../../../samVisualize/graphGeneration/graph'
import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'

const TestInputDirectory = join('src', 'test', 'samVisualize', 'testYamlTemplates')
const TestExpectedOutputDirectory = join('src', 'test', 'samVisualize', 'expectedGraphObjects')

let inputFiles: Array<string>
let expectedOutputFiles: Array<string>

describe('samVisualize Graph Generation from YAML', async function () {
    /**
     * Returns the name of a file without an extension
     * @param file File name from which the extension is removed
     * @returns A string file name with the extension removed
     */
    function withoutExtension(file: string) {
        return file.replace(/\.[^/.]+$/, '')
    }

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
                if (l1.type && !l2.type) {
                    return 1
                }
                if (!l1.type && l2.type) {
                    return -1
                }
                if (l1.type && l2.type) {
                    return l1.type > l2.type ? 1 : -1
                }
            }
            return l1.target > l2.target ? 1 : -1
        }
        return l1.source > l2.source ? 1 : -1
    }

    before(function () {
        inputFiles = readdirSync(TestInputDirectory)
        expectedOutputFiles = readdirSync(TestExpectedOutputDirectory)
    })

    it('same number of input files and expected output files', function () {
        assert.strictEqual(inputFiles.length, expectedOutputFiles.length)
    })

    it('generateGraphFromYaml() generates correct graph from YAML Cloudformation Template', function () {
        // Input files are YAML or JSON
        // Output files are JSON
        for (const file of inputFiles) {
            const inputFile = join(TestInputDirectory, file)
            const expectedOutputFile = join(TestExpectedOutputDirectory, withoutExtension(file) + '.json')

            const yamlString = readFileSync(inputFile).toString()
            const outputObject = generateGraphFromYaml(yamlString)
            const expectedObject = JSON.parse(readFileSync(expectedOutputFile).toString())

            /**
             * Ensure that node & link lists match expected output.
             * Each list is sorted the same way such that they can be
             * deeply compared regardless of their initial order.
             */

            const outputNodes = outputObject.nodes.sort(nodeAlphaCompare)
            const outputLinks = outputObject.links.sort(linkAlphaCompare)
            const expectedNodes = expectedObject.nodes.sort(nodeAlphaCompare)
            const expectedLinks = expectedObject.links.sort(linkAlphaCompare)

            assert.deepStrictEqual(outputNodes, expectedNodes)
            assert.deepStrictEqual(outputLinks, expectedLinks)
        }
    })
})
