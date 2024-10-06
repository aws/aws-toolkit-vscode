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

describe('guessSrcFileName', function () {
    it('should return undefined if no matching regex', function () {
        assert.strictEqual(utgUtils.guessSrcFileName('Foo.java', 'java'), undefined)
        assert.strictEqual(utgUtils.guessSrcFileName('folder1/foo.py', 'python'), undefined)
        assert.strictEqual(utgUtils.guessSrcFileName('Bar.js', 'javascript'), undefined)
    })

    it('java', function () {
        assert.strictEqual(utgUtils.guessSrcFileName('FooTest.java', 'java'), 'Foo.java')
        assert.strictEqual(utgUtils.guessSrcFileName('FooTests.java', 'java'), 'Foo.java')
    })

    it('python', function () {
        assert.strictEqual(utgUtils.guessSrcFileName('test_foo.py', 'python'), 'foo.py')
        assert.strictEqual(utgUtils.guessSrcFileName('foo_test.py', 'python'), 'foo.py')
    })

    it('typescript', function () {
        assert.strictEqual(utgUtils.guessSrcFileName('Foo.test.ts', 'typescript'), 'Foo.ts')
        assert.strictEqual(utgUtils.guessSrcFileName('Foo.spec.ts', 'typescript'), 'Foo.ts')
    })

    it('javascript', function () {
        assert.strictEqual(utgUtils.guessSrcFileName('Foo.test.js', 'javascript'), 'Foo.js')
        assert.strictEqual(utgUtils.guessSrcFileName('Foo.spec.js', 'javascript'), 'Foo.js')
    })
})
