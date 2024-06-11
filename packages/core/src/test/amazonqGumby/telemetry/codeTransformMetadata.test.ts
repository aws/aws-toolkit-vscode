/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    codeTransformMaxMetaDataLength,
    codeTransformMetaDataToJsonString,
} from '../../../amazonqGumby/telemetry/codeTransformMetadata'

describe('codeTransformMetaData', () => {
    it('toJsonString() should return a JSON string for small metadata', () => {
        const metaData = {
            dependencyVersionSelected: '1.2.3',
            canceledFromChat: false,
            retryCount: 2,
            errorMessage: 'Something went wrong',
        }
        const jsonString = codeTransformMetaDataToJsonString(metaData)
        assert.strictEqual(jsonString, JSON.stringify(metaData))
    })

    it('toJsonString() should truncate large metadata to fit within the maximum length', () => {
        const longString = 'x'.repeat(codeTransformMaxMetaDataLength)
        const metaData = {
            dependencyVersionSelected: '1.2.3',
            canceledFromChat: false,
            errorMessage: longString,
            retryCount: 2,
        }
        const jsonString = codeTransformMetaDataToJsonString(metaData)
        assert.ok(jsonString.length <= codeTransformMaxMetaDataLength)
        assert.deepStrictEqual(JSON.parse(jsonString), {
            dependencyVersionSelected: '1.2.3',
            canceledFromChat: false,
            retryCount: 2,
        })
    })

    it('toJsonString() should handle empty metadata', () => {
        const metaData = {}
        const jsonString = codeTransformMetaDataToJsonString(metaData)
        assert.strictEqual(jsonString, '{}')
    })
})
