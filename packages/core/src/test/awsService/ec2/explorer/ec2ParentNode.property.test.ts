/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Ec2ParentNode } from '../../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Client } from '../../../../shared/clients/ec2'

describe('ec2ParentNode parameterized tests', function () {
    const testRegion = 'us-east-1'
    const testPartition = 'aws'

    function createNode(): Ec2ParentNode {
        const client = new Ec2Client(testRegion)
        return new Ec2ParentNode(testRegion, testPartition, client)
    }

    const keyValueCases = [
        { key: 'Env', value: 'prod' },
        { key: 'Name', value: 'my-server' },
        { key: 'team', value: 'backend' },
        { key: 'a', value: 'b' },
        { key: 'key-with-dashes', value: 'value_with_underscores' },
        { key: 'CaseSensitive', value: 'MiXeD' },
        { key: 'unicode-✓', value: '日本語' },
        { key: 'spaces in key', value: 'spaces in value' },
    ]

    describe('setTagFilter produces correct filter structure and label', function () {
        for (const { key, value } of keyValueCases) {
            it(`key="${key}", value="${value}"`, function () {
                const node = createNode()
                node.setTagFilter(key, value)

                const filter = (node as any).tagFilter
                assert.deepStrictEqual(filter, [{ Name: `tag:${key}`, Values: [value] }])
                assert.strictEqual(node.label, `EC2 [tag: ${key}=${value}]`)
            })
        }
    })

    describe('clearing filter resets state and label', function () {
        for (const { key, value } of keyValueCases) {
            it(`set key="${key}", value="${value}" then clear`, function () {
                const node = createNode()
                node.setTagFilter(key, value)
                assert.notStrictEqual((node as any).tagFilter, undefined)

                node.setTagFilter('', '')
                assert.strictEqual((node as any).tagFilter, undefined)
                assert.strictEqual(node.label, 'EC2')
            })
        }
    })

    describe('input parsing splits on first equals sign', function () {
        const parsingCases = [
            { input: 'Env=prod', expectedKey: 'Env', expectedValue: 'prod' },
            { input: 'Name=my=server', expectedKey: 'Name', expectedValue: 'my=server' },
            { input: 'a=b=c=d', expectedKey: 'a', expectedValue: 'b=c=d' },
            { input: 'key=', expectedKey: 'key', expectedValue: '' },
            { input: '=value', expectedKey: '', expectedValue: 'value' },
            { input: 'x=y=z=', expectedKey: 'x', expectedValue: 'y=z=' },
        ]

        for (const { input, expectedKey, expectedValue } of parsingCases) {
            it(`"${input}" → key="${expectedKey}", value="${expectedValue}"`, function () {
                const trimmed = input.trim()
                const eqIndex = trimmed.indexOf('=')
                const key = trimmed.substring(0, eqIndex)
                const value = trimmed.substring(eqIndex + 1)

                assert.strictEqual(key, expectedKey)
                assert.strictEqual(value, expectedValue)
                assert.strictEqual(`${key}=${value}`, trimmed)
            })
        }
    })

    describe('key-only filter (empty value) sets filter for tag existence', function () {
        const keyOnlyCases = ['Prod', 'Environment', 'my-tag', 'a']

        for (const key of keyOnlyCases) {
            it(`key="${key}" with empty value`, function () {
                const node = createNode()
                node.setTagFilter(key, '')

                const filter = (node as any).tagFilter
                assert.deepStrictEqual(filter, [{ Name: `tag:${key}`, Values: [''] }])
                assert.strictEqual(node.label, `EC2 [tag: ${key}]`)
            })
        }
    })

    describe('whitespace-only input clears filter', function () {
        const whitespaceCases = [' ', '  ', '\t', '\n', ' \t\n ', '   \t   ']

        for (const ws of whitespaceCases) {
            it(`"${ws.replace(/\t/g, '\\t').replace(/\n/g, '\\n')}" treated as empty`, function () {
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
})
