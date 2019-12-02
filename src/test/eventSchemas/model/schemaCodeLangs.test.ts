/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getLanguageDetails, schemaCodeLangs } from '../../../eventSchemas/models/schemaCodeLangs'

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
