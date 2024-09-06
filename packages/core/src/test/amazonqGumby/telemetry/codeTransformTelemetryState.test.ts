/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ICodeTransformMetaData } from '../../../amazonqGumby/telemetry/codeTransformMetadata'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { randomUUID } from '../../../shared/crypto'

describe('CodeTransformTelemetryState', () => {
    it('Does get singleton instance', () => {
        const instance = CodeTransformTelemetryState.instance
        const anotherInstance = CodeTransformTelemetryState.instance
        assert.strictEqual(instance, anotherInstance, 'Instances should be the same')
    })

    it('Initial defaults are set', () => {
        const instance = CodeTransformTelemetryState.instance
        assert.strictEqual(instance.getSessionId().length, 36, 'Session ID should be a valid UUID')
        assert.strictEqual(typeof instance.getStartTime(), 'number', 'Start time should be a number')
        assert.strictEqual(instance.getResultStatus(), '', 'Result status should be an empty string')
        assert.deepStrictEqual(
            instance.getCodeTransformMetaData(),
            {},
            'Code transform metadata should be an empty object'
        )
    })

    it('Does et and get values for internal properties', () => {
        const instance = CodeTransformTelemetryState.instance

        const newSessionId = randomUUID()
        const newStartTime = instance.getStartTime()
        const newResultStatus = 'SUCCESS'
        const newMetaData: ICodeTransformMetaData = {
            dependencyVersionSelected: '1.2.3',
            canceledFromChat: true,
            retryCount: 2,
            errorMessage: 'Something went wrong',
        }

        instance.setSessionId()
        instance.setStartTime()
        instance.setResultStatus(newResultStatus)
        instance.setCodeTransformMetaDataField(newMetaData)
        assert.notStrictEqual(instance.getSessionId(), newSessionId, 'Session ID should be updated')
        assert.notStrictEqual(instance.getStartTime(), newStartTime, 'Start time should be updated')
        assert.strictEqual(instance.getResultStatus(), newResultStatus, 'Result status should be updated')
        assert.deepStrictEqual(
            instance.getCodeTransformMetaData(),
            newMetaData,
            'Code transform metadata should be updated'
        )
    })

    it('Does resetCodeTransformMetaDataField() state', () => {
        const instance = CodeTransformTelemetryState.instance
        instance.resetCodeTransformMetaDataField()
        assert.deepStrictEqual(
            instance.getCodeTransformMetaData(),
            {},
            'Code transform metadata should be reset to an empty object'
        )
    })

    it('Does get code transform metadata string', () => {
        const instance = CodeTransformTelemetryState.instance
        const metaData: ICodeTransformMetaData = {
            dependencyVersionSelected: '1.2.3',
            canceledFromChat: true,
            retryCount: 2,
            errorMessage: 'Something went wrong',
        }

        instance.setCodeTransformMetaDataField(metaData)
        const metaDataString = instance.getCodeTransformMetaDataString()
        assert.strictEqual(typeof metaDataString, 'string', 'Metadata string should be a string')
        assert.deepStrictEqual(JSON.parse(metaDataString), metaData, 'Metadata string should match the metadata object')
    })
})
