/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Arn, parse, parseAll, ParseResult, toString } from '../../../shared/deeplinks/arn'

describe('ARNs', function () {
    interface TestCase {
        readonly input: string
        readonly expected?: string
    }

    it('can be converted to a string', function () {
        const arn: Arn = {
            partition: 'aws',
            service: 'slackbot',
            region: 'af-south-1',
            accountId: '',
            resource: 'my/resource/',
        }

        assert.strictEqual(toString(arn), 'arn:aws:slackbot:af-south-1::my/resource/')
    })

    describe('valid cases', function () {
        const cases: Record<string, TestCase> = {
            'no region': { input: 'arn:aws:iam::123456789012:user/Development/product-abc_1234/*' },
            'no account or region': { input: 'arn:aws:s3:::my_corporate_bucket/Development/*' },
            'single quotes': {
                input: "'arn:aws:s3:::testbucket/sam_squirrel_1.jpg'",
                expected: 'arn:aws:s3:::testbucket/sam_squirrel_1.jpg',
            },
            'double quotes': {
                input: '"arn:aws:states:us-east-1:000000:stateMachine:MyStateMachine"',
                expected: 'arn:aws:states:us-east-1:000000:stateMachine:MyStateMachine',
            },
            spaces: {
                input: '  \n arn:aws:iot:us-weast-99:123567:cert/h123khqkwjhsdi12   /asas123jasasd\nasjkdk',
                expected: 'arn:aws:iot:us-weast-99:123567:cert/h123khqkwjhsdi12',
            },
            'spaces and commas': {
                input: '   //,  arn:aws:apigateway:us-west-2::/apis/h123kas,\n    arn:aws:s3::::::',
                expected: 'arn:aws:apigateway:us-west-2::/apis/h123kas',
            },
            'quoted spaces': {
                input: "  'arn:aws:ecr:us-east-1:8134918:r e p o'   ",
                expected: 'arn:aws:ecr:us-east-1:8134918:r e p o',
            },
            'quoted punctuation': {
                input: '"arn:aws:s3:::bucket/file."',
                expected: 'arn:aws:s3:::bucket/file.',
            },
        }

        for (const [name, { input, expected }] of Object.entries(cases)) {
            it(`can parse ARNs with ${name}`, function () {
                const result = parse(input)
                assert.strictEqual(toString(result), expected ?? input)
            })
        }
    })

    describe('invalid cases', function () {
        const cases: Record<string, TestCase> = {
            'partial values': { input: 'arn:::' },
            'a bad partition': { input: 'arn:bad:s3:::testbucket/sam_squirrel_1.jpg' },
            'an invalid account': { input: 'arn:aws:iot:us-weast-99:acccccoount1234:cert/h123khqkwjhsdi12' },
            'no service': { input: 'arn:aws::::' },
            'non-alphanumeric services': { input: 'arn:aws:s3?:::/' },
            'non-alphanumeric regions': { input: 'arn:aws:lambda:us.weast]1:0123456:my_handler' },
        }

        for (const [name, { input }] of Object.entries(cases)) {
            it(`throws on ARNs with ${name}`, function () {
                assert.throws(() => parse(input))
            })
        }
    })

    describe('parseAll', function () {
        it('returns the exact matched text', function () {
            const input = 'arn: "arn:aws:cloudformation:east:1234:stack/3hj4kjsh21io3/f1de8d4e1"'
            const { value, done } = parseAll(input).next()

            assert.ok(!done)
            assert.strictEqual(value.text, '"arn:aws:cloudformation:east:1234:stack/3hj4kjsh21io3/f1de8d4e1"')
        })

        it('can parse multiple ARNs from text', function () {
            const input = `
/* one arn is arn:aws:apigateway:us-west-2::/apis/h123kas,\n  but this is not: arn:aws: arn:s3:::::: and
definitely neither is this "arn:aws:iot:us-weast-99:acccccoount1234:cert/h123khqkwjhsdi12"
*/

some other ARNs: arn:aws:s3:::testbucket/sam_squirrel_1.jpg, "arn:aws:states:us-east-1:000000:stateMachine:MyStateMachine"
as well as arn:aws:iot:us-east-1:7687686789:policy/new-policy.
`
            const result = Array.from(parseAll(input))
            const str = (r: ParseResult) => toString(r.data)

            assert.strictEqual(result.length, 4)

            assert.strictEqual(str(result[0]), 'arn:aws:apigateway:us-west-2::/apis/h123kas')
            assert.strictEqual(str(result[1]), 'arn:aws:s3:::testbucket/sam_squirrel_1.jpg')
            assert.strictEqual(str(result[2]), 'arn:aws:states:us-east-1:000000:stateMachine:MyStateMachine')
            assert.strictEqual(str(result[3]), 'arn:aws:iot:us-east-1:7687686789:policy/new-policy')

            // Recommended to just generate these expected values if changing the input
            assert.strictEqual(result[0].offset, 15)
            assert.strictEqual(result[1].offset, 217)
            assert.strictEqual(result[2].offset, 261)
            assert.strictEqual(result[3].offset, 334)
        })
    })
})
