/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { fs } from '../../../shared/fs/fs'
import * as path from 'path'

describe('CloudFormation Grammar', function () {
    let grammar: any

    before(async function () {
        // Load grammar from toolkit syntaxes directory
        const grammarPath = path.join(__dirname, '../../../../../../toolkit/syntaxes/cloudformation.tmLanguage.json')
        const content = await fs.readFileText(grammarPath)
        grammar = JSON.parse(content)
    })

    describe('Grammar Structure', function () {
        it('should have correct basic structure', function () {
            assert.strictEqual(grammar.name, 'CloudFormation')
            assert.strictEqual(grammar.scopeName, 'source.cloudformation')
            assert.ok(grammar.fileTypes.includes('template'))
            assert.ok(grammar.fileTypes.includes('cfn'))
        })

        it('should include dual-format detection patterns', function () {
            assert.strictEqual(grammar.patterns.length, 2)

            // JSON detection pattern
            assert.strictEqual(grammar.patterns[0].begin, '^\\s*\\{')
            assert.strictEqual(grammar.patterns[0].name, 'meta.cloudformation.json')
            assert.strictEqual(grammar.patterns[0].patterns[0].include, 'source.json')

            // YAML detection pattern
            assert.strictEqual(grammar.patterns[1].begin, '^(?!\\s*\\{)')
            assert.strictEqual(grammar.patterns[1].name, 'meta.cloudformation.yaml')
        })

        it('should have repository with required patterns', function () {
            const requiredPatterns = ['cfn-top-level-keys', 'cfn-logical-ids', 'cfn-functions']

            for (const pattern of requiredPatterns) {
                assert.ok(grammar.repository[pattern], `Pattern ${pattern} should be defined`)
            }
        })
    })

    describe('CloudFormation-Specific Patterns', function () {
        it('should match top-level CloudFormation sections', function () {
            const pattern = grammar.repository['cfn-top-level-keys'].patterns[0]
            assert.ok(pattern)
        })

        it('should have logical ID patterns for all major sections', function () {
            const logicalIds = grammar.repository['cfn-logical-ids']
            assert.ok(logicalIds)
            assert.ok(logicalIds.patterns)

            // Check that we have patterns for Resources, Parameters, Conditions, Outputs, and Mappings
            const sectionNames: (string | undefined)[] = logicalIds.patterns.map((pattern: any) => {
                const match = (pattern.begin as string).match(/\^\(([^)]+)\)/)
                return match ? match[1] : undefined
            })

            const expectedSections = ['Resources', 'Parameters', 'Conditions', 'Outputs', 'Mappings']
            for (const section of expectedSections) {
                assert.ok(
                    sectionNames.some((name) => name && name.includes(section)),
                    `Should have pattern for ${section} section`
                )
            }
        })
    })
})
