/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'
import { generateResourceLineMap, ResourceLineMap } from '../../../samVisualize/rendering/navigation'
import { getProjectDir } from '../../testUtil'
import { trimExtension } from '../../../shared/utilities/pathUtils'

const yamlTemplatesDir = join(
    getProjectDir(),
    'testFixtures',
    'workspaceFolder',
    'samVisualize-test-data',
    'testYamlTemplates'
)

const resourceLineMapDir = join(
    getProjectDir(),
    'testFixtures',
    'workspaceFolder',
    'samVisualize-test-data',
    'expectedResourceLineMaps'
)

let templateFiles: Array<string>
let resourceLineMapFiles: Array<string>

describe('generateResourceLineMap', function () {
    before(function () {
        templateFiles = readdirSync(yamlTemplatesDir)
        resourceLineMapFiles = readdirSync(resourceLineMapDir)
    })

    it('same number of templates and ResourceLineMaps', function () {
        assert.strictEqual(templateFiles.length, resourceLineMapFiles.length)
    })

    // Note that line numbers in vscode are zero based, so the correct value is one less than what appears in the template
    it('correctly generates a map between a resource name and its start and end positions in the template', async function () {
        for (const file of templateFiles) {
            const templatePath = join(yamlTemplatesDir, file)

            const resourceLineMapPath = join(resourceLineMapDir, trimExtension(file) + '.json')

            const templateContents = readFileSync(templatePath).toString()

            const expectedResourceLineMap: ResourceLineMap = JSON.parse(readFileSync(resourceLineMapPath).toString())

            const actualResourceLineMap = generateResourceLineMap(templateContents)

            assert.deepStrictEqual(actualResourceLineMap, expectedResourceLineMap, `In ${file}`)
        }
    })
})
