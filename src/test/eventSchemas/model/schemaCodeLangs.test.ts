/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    getApiValueForSchemasDownload,
    getLanguageDetails,
    schemaCodeLangs,
} from '../../../eventSchemas/models/schemaCodeLangs'
import { samZipLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { assertThrowsError } from '../../../test/shared/utilities/assertUtils'

describe('getLanguageDetails', () => {
    it('should successfully return details for supported languages', () => {
        for (const language of schemaCodeLangs.values()) {
            const result = getLanguageDetails(language)
            assert.ok(
                result,
                `Language : ${language}, api value : ${result.apiValue}, language extension : ${result.extension}`
            )
        }
    })
})

describe('getApiValueForSchemasDownload', () => {
    it('should return api value for runtimes supported by eventBridge application', async () => {
        for (const runtime of samZipLambdaRuntimes.values()) {
            switch (runtime) {
                case 'python3.6':
                case 'python3.7':
                case 'python3.8': {
                    const result = getApiValueForSchemasDownload(runtime)
                    assert.strictEqual(result, 'Python36', 'Api value used by schemas api')
                    break
                }
                default: {
                    const errorMessage = `Runtime ${runtime} is not supported by eventBridge application`
                    const error = await assertThrowsError(async () => getApiValueForSchemasDownload(runtime))
                    assert.strictEqual(error.message, errorMessage, 'Should fail for same error')
                    break
                }
            }
        }
    })
})
