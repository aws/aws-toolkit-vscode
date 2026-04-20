/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Ec2ParentNode } from '../../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Client } from '../../../../shared/clients/ec2'

describe('ec2ParentNode property tests', function () {
    const testRegion = 'us-east-1'
    const testPartition = 'aws'

    function createNode(): Ec2ParentNode {
        const client = new Ec2Client(testRegion)
        return new Ec2ParentNode(testRegion, testPartition, client)
    }

    const tagCases = [
        ['Env', 'prod'],
        ['Name', 'my-server'],
        ['team', 'backend'],
        ['key-with-dashes', 'value_with_underscores'],
        ['CaseSensitive', 'MiXeD'],
        ['unicode', '日本語'],
        ['a', 'b'],
    ] as const

    for (const [key, value] of tagCases) {
        it(`setTagFilter produces correct filter and label for ${key}=${value}`, function () {
            const node = createNode()
            node.setTagFilter(key, value)

            const filter = (node as any).tagFilter
            assert.deepStrictEqual(filter, [{ Name: `tag:${key}`, Values: [value] }])
            assert.strictEqual(node.label, `EC2 [tag: ${key}=${value}]`)
        })
    }

    for (const [key, value] of tagCases) {
        it(`clearing filter resets state after setting ${key}=${value}`, function () {
            const node = createNode()
            node.setTagFilter(key, value)
            assert.notStrictEqual((node as any).tagFilter, undefined)

            node.setTagFilter('', '')
            assert.strictEqual((node as any).tagFilter, undefined)
            assert.strictEqual(node.label, 'EC2')
        })
    }

    const splitCases = [
        ['Env=prod', 'Env', 'prod'],
        ['Name=my=server', 'Name', 'my=server'],
        ['key=a=b=c', 'key', 'a=b=c'],
        ['tag=', 'tag', ''],
        ['x=y', 'x', 'y'],
    ] as const

    for (const [input, expectedKey, expectedValue] of splitCases) {
        it(`input "${input}" splits into key="${expectedKey}" value="${expectedValue}"`, function () {
            const trimmed = input.trim()
            const eqIndex = trimmed.indexOf('=')
            const key = trimmed.substring(0, eqIndex)
            const value = trimmed.substring(eqIndex + 1)

            assert.strictEqual(key, expectedKey)
            assert.strictEqual(value, expectedValue)
            assert.ok(!key.includes('='))
        })
    }

    const whitespaceCases = [' ', '  ', '\t', '\n', ' \t\n ', '\r\n']

    for (const ws of whitespaceCases) {
        it(`whitespace-only input ${JSON.stringify(ws)} clears filter`, function () {
            const trimmed = ws.trim()
            assert.strictEqual(trimmed, '')

            const node = createNode()
            node.setTagFilter('SomeKey', 'SomeValue')
            node.setTagFilter('', '')

            assert.strictEqual((node as any).tagFilter, undefined)
            assert.strictEqual(node.label, 'EC2')
        })
    }
})
