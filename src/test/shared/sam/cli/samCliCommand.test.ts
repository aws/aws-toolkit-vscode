/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SamCliInfoCommand, SamCliInfoResponse } from '../../../../shared/sam/cli/samCliCommand'
import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'

describe('SamInfoCliCommand', async () => {

    class TestSamCliInfoCommand extends SamCliInfoCommand {
        public convertOutput(text: string): SamCliInfoResponse | undefined {
            return super.convertOutput(text)
        }
    }

    it('throws exception if sam cli location is not known', async () => {
        const samCliConfig: SamCliConfiguration = {
            getSamCliLocation: () => undefined
        } as any as SamCliConfiguration

        const command = new SamCliInfoCommand(samCliConfig)

        try {
            await command.execute()
            assert.strictEqual(true, false, 'error expected')
        } catch (err) {
            assert.notStrictEqual(err, undefined)
        }
    })

    it('converts sam info response to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
            .convertOutput('{"version": "1.2.3"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response without version to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
            .convertOutput('{}')

        assert.ok(response)
        assert.strictEqual(response!.version, undefined)
    })

    it('converts non-response to undefined', async () => {
        [
            'qwerty',
            '{"version": "1.2.3"} you have no new email messages'
        ].forEach(output => {
            const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
                .convertOutput(output)

            assert.strictEqual(response, undefined, `Expected text to not parse: ${output}`)
        })
    })
})
