/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TelemetryHelper, session } from 'aws-core-vscode/codewhisperer'
import sinon from 'sinon'

describe('telemetryHelper', function () {
    describe('clientComponentLatency', function () {
        let sut: TelemetryHelper

        beforeEach(function () {
            sut = new TelemetryHelper()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('resetClientComponentLatencyTime should reset state variables', function () {
            session.invokeSuggestionStartTime = 100
            session.preprocessEndTime = 200
            session.sdkApiCallStartTime = 300
            session.fetchCredentialStartTime = 400
            session.firstSuggestionShowTime = 500

            sut.setSdkApiCallEndTime()
            sut.setAllPaginationEndTime()
            sut.setFirstResponseRequestId('aFakeRequestId')

            sut.resetClientComponentLatencyTime()

            assert.strictEqual(session.invokeSuggestionStartTime, 0)
            assert.strictEqual(session.preprocessEndTime, 0)
            assert.strictEqual(session.sdkApiCallStartTime, 0)
            assert.strictEqual(session.fetchCredentialStartTime, 0)
            assert.strictEqual(session.firstSuggestionShowTime, 0)
            assert.strictEqual(sut.sdkApiCallEndTime, 0)
            assert.strictEqual(sut.allPaginationEndTime, 0)
            assert.strictEqual(sut.firstResponseRequestId, '')
        })

        it('setInvocationSuggestionStartTime should call resetClientComponentLatencyTime', function () {
            const resetStub = sinon.stub(sut, 'resetClientComponentLatencyTime')
            sut.setInvokeSuggestionStartTime()
            assert.ok(resetStub.calledOnce)
        })
    })
})
