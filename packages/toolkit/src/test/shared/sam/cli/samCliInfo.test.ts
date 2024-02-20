/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SamCliInfoInvocation, SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInfo'

describe('SamCliInfoInvocation', async function () {
    class TestSamCliInfoCommand extends SamCliInfoInvocation {
        public override convertOutput(text: string): SamCliInfoResponse | undefined {
            return super.convertOutput(text)
        }
    }

    it('converts sam info response to SamCliInfoResponse', async function () {
        const response = new TestSamCliInfoCommand('').convertOutput('{"version": "1.2.3"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response containing unexpected fields to SamCliInfoResponse', async function () {
        const response = new TestSamCliInfoCommand('').convertOutput('{"version": "1.2.3", "bananas": "123"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response without version to SamCliInfoResponse', async function () {
        const response = new TestSamCliInfoCommand('').convertOutput('{}')

        assert.ok(response)
        assert.strictEqual(response!.version, undefined)
    })

    it('converts non-response to undefined', async function () {
        ;['qwerty', '{"version": "1.2.3"} you have no new email messages'].forEach(output => {
            const response = new TestSamCliInfoCommand('').convertOutput(output)

            assert.strictEqual(response, undefined, `Expected text to not parse: ${output}`)
        })
    })
})
