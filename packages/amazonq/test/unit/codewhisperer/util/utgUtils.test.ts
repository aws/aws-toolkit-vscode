/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as utgUtils from 'aws-core-vscode/codewhisperer'

describe('shouldFetchUtgContext', () => {
    it('fully supported language', function () {
        assert.ok(utgUtils.shouldFetchUtgContext('java'))
    })

    it('partially supported language', () => {
        assert.strictEqual(utgUtils.shouldFetchUtgContext('python'), false)
    })

    it('not supported language', () => {
        assert.strictEqual(utgUtils.shouldFetchUtgContext('typescript'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('javascript'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('javascriptreact'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('typescriptreact'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('scala'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('shellscript'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('csharp'), undefined)

        assert.strictEqual(utgUtils.shouldFetchUtgContext('c'), undefined)
    })
})
