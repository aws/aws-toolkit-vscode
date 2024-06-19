/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    getApiValueForSchemasDownload,
    getLanguageDetails,
    schemaCodeLangs,
} from '../../../eventSchemas/models/schemaCodeLangs'
import { samZipLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'

describe('getLanguageDetails', function () {
    it('should successfully return details for supported languages', function () {
        for (const language of schemaCodeLangs.values()) {
            const result = getLanguageDetails(language)
            assert.ok(
                result,
                `Language : ${language}, api value : ${result.apiValue}, language extension : ${result.extension}`
            )
        }
    })
})

describe('getApiValueForSchemasDownload', function () {
    it('should return api value for runtimes supported by eventBridge application', async function () {
        for (const runtime of samZipLambdaRuntimes.values()) {
            switch (runtime) {
                case 'python3.7':
                case 'python3.8':
                case 'python3.9':
                case 'python3.11':
                case 'python3.12':
                case 'python3.10': {
                    const result = getApiValueForSchemasDownload(runtime)
                    assert.strictEqual(result, 'Python36', 'Api value used by schemas api')
                    break
                }
                case 'go1.x': {
                    const result = getApiValueForSchemasDownload(runtime)
                    assert.strictEqual(result, 'Go1', 'Api value used by schemas api')
                    break
                }
                default: {
                    const errorMessage = `Runtime ${runtime} is not supported by eventBridge application`
                    assert.throws(
                        () => getApiValueForSchemasDownload(runtime),
                        new Error(errorMessage),
                        'Should fail for same error'
                    )
                    break
                }
            }
        }
    })
})
