/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { startupFailureMessage } from '../../../awsService/cloudformation/utils'

describe('CloudFormation startupFailureMessage', function () {
    const cases = [
        ['ManifestFetchFailed', 'Failed to fetch CloudFormation LSP manifest'],
        ['NoCompatibleVersion', 'No compatible CloudFormation LSP version'],
        ['RemoteDownloadFailed', 'Failed to download CloudFormation LSP'],
        ['ExtractionFailed', 'Failed to extract CloudFormation LSP'],
        ['HashIntegrityFailed', 'Downloaded file integrity check failed'],
    ] as const

    for (const [code, expected] of cases) {
        it(`maps ${code} to its user-facing category`, function () {
            const cause = Object.assign(new Error('cause'), { code })
            const wrapped = Object.assign(new Error('wrapper'), { cause })

            assert.ok(startupFailureMessage(wrapped)?.includes(expected))
        })
    }

    it('does not map an unclassified process-start error', function () {
        assert.strictEqual(startupFailureMessage(new Error('boom')), undefined)
    })
})
