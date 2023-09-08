/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as utgUtils from '../../../codewhisperer/util/supplementalContext/utgUtils'
import { UserGroup } from '../../../codewhisperer/models/constants'

describe('shouldFetchUtgContext', () => {
    it('fully supported language', function () {
        assert.ok(utgUtils.shouldFetchUtgContext('java', UserGroup.Control))
        assert.ok(utgUtils.shouldFetchUtgContext('java', UserGroup.CrossFile))
    })

    it('partially supported language', () => {
        assert.strictEqual(utgUtils.shouldFetchUtgContext('python', UserGroup.Control), false)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('python', UserGroup.CrossFile), true)
    })

    it('not supported language', () => {
        assert.strictEqual(utgUtils.shouldFetchUtgContext('typescript', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('typescript', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('javascript', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('javascript', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('javascriptreact', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('javascriptreact', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('typescriptreact', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('typescriptreact', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('scala', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('scala', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('shellscript', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('shellscript', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('csharp', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('csharp', UserGroup.CrossFile), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('c', UserGroup.Control), undefined)
        assert.strictEqual(utgUtils.shouldFetchUtgContext('c', UserGroup.CrossFile), undefined)
    })
})
