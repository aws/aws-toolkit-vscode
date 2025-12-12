/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    arnToConsoleUrl,
    arnToConsoleTabUrl,
    operationIdToConsoleUrl,
} from '../../../awsService/cloudformation/consoleLinksUtils'

describe('consoleLinksUtils', () => {
    const testArn = 'arn:aws:cloudformation:us-west-2:123456789012:stack/test-stack/abc-123'

    describe('arnToConsoleUrl', () => {
        it('should generate correct console URL', () => {
            const url = arnToConsoleUrl(testArn)
            assert.strictEqual(
                url,
                'https://console.aws.amazon.com/go/view?arn=arn%3Aaws%3Acloudformation%3Aus-west-2%3A123456789012%3Astack%2Ftest-stack%2Fabc-123'
            )
        })
    })

    describe('arnToConsoleTabUrl', () => {
        it('should generate correct events tab URL', () => {
            const url = arnToConsoleTabUrl(testArn, 'events')
            assert.strictEqual(
                url,
                'https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks/events?stackId=arn%3Aaws%3Acloudformation%3Aus-west-2%3A123456789012%3Astack%2Ftest-stack%2Fabc-123'
            )
        })

        it('should generate correct resources tab URL', () => {
            const url = arnToConsoleTabUrl(testArn, 'resources')
            assert.strictEqual(
                url,
                'https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks/resources?stackId=arn%3Aaws%3Acloudformation%3Aus-west-2%3A123456789012%3Astack%2Ftest-stack%2Fabc-123'
            )
        })

        it('should generate correct outputs tab URL', () => {
            const url = arnToConsoleTabUrl(testArn, 'outputs')
            assert.strictEqual(
                url,
                'https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks/outputs?stackId=arn%3Aaws%3Acloudformation%3Aus-west-2%3A123456789012%3Astack%2Ftest-stack%2Fabc-123'
            )
        })
    })

    describe('operationIdToConsoleUrl', () => {
        it('should generate correct operation details URL', () => {
            const operationId = '056a1310-6307-466a-a167-2cbbd353b29f'
            const url = operationIdToConsoleUrl(testArn, operationId)
            assert.strictEqual(
                url,
                'https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks/operations/info?stackId=arn%3Aaws%3Acloudformation%3Aus-west-2%3A123456789012%3Astack%2Ftest-stack%2Fabc-123&operationId=056a1310-6307-466a-a167-2cbbd353b29f'
            )
        })

        it('should handle different regions', () => {
            const euArn = 'arn:aws:cloudformation:eu-west-1:123456789012:stack/test-stack/abc-123'
            const operationId = 'op-456'
            const url = operationIdToConsoleUrl(euArn, operationId)
            assert.ok(url.includes('eu-west-1.console.aws.amazon.com'))
            assert.ok(url.includes('region=eu-west-1'))
            assert.ok(url.includes('operationId=op-456'))
        })
    })
})
