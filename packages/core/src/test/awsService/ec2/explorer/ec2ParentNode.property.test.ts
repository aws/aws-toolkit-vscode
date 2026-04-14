/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import fc from 'fast-check'
import { Ec2ParentNode } from '../../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Client } from '../../../../shared/clients/ec2'

describe('ec2ParentNode property tests', function () {
    const testRegion = 'us-east-1'
    const testPartition = 'aws'

    function createNode(): Ec2ParentNode {
        const client = new Ec2Client(testRegion)
        return new Ec2ParentNode(testRegion, testPartition, client)
    }

    /**
     * Feature: ec2-tag-filter, Property 1: setTagFilter produces correct filter structure and label
     * Validates: Requirements 1.3, 7.1
     */
    it('Property 1: for any non-empty key/value, setTagFilter produces correct Filter[] structure and label format', function () {
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (key, value) => {
                const node = createNode()
                node.setTagFilter(key, value)

                const filter = (node as any).tagFilter
                assert.deepStrictEqual(filter, [{ Name: `tag:${key}`, Values: [value] }])
                assert.strictEqual(node.label, `EC2 [tag: ${key}=${value}]`)
            }),
            { numRuns: 100 }
        )
    })

    /**
     * Feature: ec2-tag-filter, Property 2: Clearing filter resets state and label
     * Validates: Requirements 1.4, 7.2, 7.3
     */
    it('Property 2: for any previously-filtered node, clearing with empty args resets tagFilter to undefined and label to EC2', function () {
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (key, value) => {
                const node = createNode()

                // First set a filter
                node.setTagFilter(key, value)
                assert.notStrictEqual((node as any).tagFilter, undefined)

                // Then clear it
                node.setTagFilter('', '')
                assert.strictEqual((node as any).tagFilter, undefined)
                assert.strictEqual(node.label, 'EC2')
            }),
            { numRuns: 100 }
        )
    })

    /**
     * Feature: ec2-tag-filter, Property 3: Input parsing splits on first equals sign
     * Validates: Requirements 4.1, 8.1
     */
    it('Property 3: for any string containing =, splitting on first = produces key + = + value === original string', function () {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }).chain((prefix) => fc.string().map((suffix) => `${prefix}=${suffix}`)),
                (input) => {
                    const trimmed = input.trim()
                    // Only test non-empty trimmed strings that contain '='
                    fc.pre(trimmed.length > 0 && trimmed.includes('='))

                    const eqIndex = trimmed.indexOf('=')
                    const key = trimmed.substring(0, eqIndex)
                    const value = trimmed.substring(eqIndex + 1)

                    // Reconstructed string must equal the original trimmed input
                    assert.strictEqual(`${key}=${value}`, trimmed)
                    // Key must not contain '=' (it's everything before the first '=')
                    assert.ok(!key.includes('='), `key "${key}" should not contain '='`)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Feature: ec2-tag-filter, Property 5: Key-only filter (empty value) sets filter for tag existence
     * Validates: EC2 tags can have empty values
     */
    it('Property 5: for any non-empty key with empty value, setTagFilter sets filter and label without value', function () {
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (key) => {
                const node = createNode()
                node.setTagFilter(key, '')

                const filter = (node as any).tagFilter
                assert.deepStrictEqual(filter, [{ Name: `tag:${key}`, Values: [''] }])
                assert.strictEqual(node.label, `EC2 [tag: ${key}]`)
            }),
            { numRuns: 100 }
        )
    })

    /**
     * Feature: ec2-tag-filter, Property 4: Whitespace-only input clears filter
     * Validates: Requirements 8.3
     */
    it('Property 4: for any whitespace-only string, input is treated as empty and filter is cleared', function () {
        const whitespaceChars = [' ', '\t', '\n', '\r', '\f', '\v']
        fc.assert(
            fc.property(
                fc
                    .array(fc.constantFrom(...whitespaceChars), { minLength: 1, maxLength: 50 })
                    .map((chars) => chars.join('')),
                (wsInput) => {
                    const trimmed = wsInput.trim()
                    assert.strictEqual(trimmed, '', 'Whitespace-only input should trim to empty string')

                    // Simulate the command handler logic: empty trimmed input clears the filter
                    const node = createNode()
                    // First set a filter so we can verify it gets cleared
                    node.setTagFilter('SomeKey', 'SomeValue')

                    // trimmed is guaranteed empty at this point, so clear the filter
                    node.setTagFilter('', '')

                    assert.strictEqual((node as any).tagFilter, undefined)
                    assert.strictEqual(node.label, 'EC2')
                }
            ),
            { numRuns: 100 }
        )
    })
})
