/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateDocumentName } from '../../../ssmDocument/util/validateDocumentName'

describe('validateDocumenttName', function () {
    const invalidErrors: { documentNames: string[]; error: string }[] = [
        { documentNames: [''], error: 'Document name cannot be empty' },
        {
            documentNames: ['AmazonTestDocument', 'AWS-TestDocument'],
            error: 'Document name cannot start with Amazon or AWS-',
        },
        {
            documentNames: ['til~de', 'quo"te', 'paren(theses', 'sla/sh', 'brac[et', '?mark', 'mone$'],
            error: 'Document name contains invalid characters, only a-z, A-Z, 0-9, and _, -, and . are allowed',
        },
        {
            documentNames: ['a', 'aa', 'a'.repeat(129), 'a'.repeat(256)],
            error: 'Document name length must be between 3 and 128 characters',
        },
    ]
    it('returns undefined for a valid document name', function () {
        assert.strictEqual(validateDocumentName('Aaaaa'), undefined)
    })

    invalidErrors.forEach(invalid => {
        describe(invalid.error, () => {
            invalid.documentNames.forEach(documentName => {
                it(documentName, () => {
                    assert.strictEqual(validateDocumentName(documentName), invalid.error)
                })
            })
        })
    })
})
