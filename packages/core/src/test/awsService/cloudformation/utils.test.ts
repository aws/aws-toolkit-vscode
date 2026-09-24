/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { clientIdForInitialization, startupFailureMessage } from '../../../awsService/cloudformation/utils'
import { nilClientId, telemetryDisabledClientId, testClientId } from '../../../shared/telemetry/util'

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

    it('maps LspStartFailed (server could not start after a reinstall) to a generic message', function () {
        const err = Object.assign(new Error('start failed'), { code: 'LspStartFailed', cause: new Error('spawn') })
        assert.ok(startupFailureMessage(err)?.includes('failed to start'))
    })

    it('prefers an install cause over the generic start failure', function () {
        const cause = Object.assign(new Error('cause'), { code: 'ExtractionFailed' })
        const err = Object.assign(new Error('start failed'), { code: 'LspStartFailed', cause })
        assert.ok(startupFailureMessage(err)?.includes('Failed to extract CloudFormation LSP'))
    })

    it('ignores unrelated codes such as EACCES in the cause chain', function () {
        const cause = Object.assign(new Error('EACCES'), { code: 'EACCES' })
        assert.strictEqual(startupFailureMessage(Object.assign(new Error('wrapper'), { cause })), undefined)
    })
})

describe('CloudFormation clientIdForInitialization', function () {
    const realClientId = '2f1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

    it('forwards a real client id when telemetry is enabled', function () {
        assert.strictEqual(clientIdForInitialization(true, realClientId), realClientId)
    })

    it('withholds the client id when telemetry is disabled', function () {
        assert.strictEqual(clientIdForInitialization(false, realClientId), undefined)
    })

    for (const placeholder of [testClientId, telemetryDisabledClientId, nilClientId]) {
        it(`withholds the placeholder id ${placeholder}`, function () {
            assert.strictEqual(clientIdForInitialization(true, placeholder), undefined)
        })
    }
})
