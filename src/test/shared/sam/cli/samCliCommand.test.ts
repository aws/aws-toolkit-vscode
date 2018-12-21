/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SamCliInfoResponse, SamInfoCliCommand } from '../../../../shared/sam/cli/samCliCommand'

describe('SamInfoCliCommand', async () => {

    it('converts sam info response to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = SamInfoCliCommand.convertOutput('{"version": "1.2.3"}')

        assert.ok(response)
        assert.equal(response!.version, '1.2.3')
    })

    it('converts sam info response without version to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = SamInfoCliCommand.convertOutput('{}')

        assert.ok(response)
        assert.equal(response!.version, undefined)
    })

    it('converts non-response to undefined', async () => {
        [
            'qwerty',
            '{"version": "1.2.3"} you have no new email messages'
        ].forEach(output => {
            const response: SamCliInfoResponse | undefined = SamInfoCliCommand.convertOutput(output)

            assert.equal(response, undefined, `Expected text to not parse: ${output}`)
        })
    })
})
