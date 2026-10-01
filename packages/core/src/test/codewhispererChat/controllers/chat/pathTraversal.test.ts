/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'

/**
 * Tests for the path traversal validation patterns used in:
 * - controller.ts processCustomFormAction (filename check)
 * - controller.ts processFileClickMessage (path.resolve + startsWith check)
 * - backend.ts getLocalFilePath (path.resolve + startsWith check)
 */
describe('path traversal validation', function () {
    describe('filename validation (processCustomFormAction pattern)', function () {
        function isValidFileName(fileName: string): boolean {
            return !fileName.includes('/') && !fileName.includes('\\') && !fileName.includes('..')
        }

        it('rejects path with forward slash', function () {
            assert.strictEqual(isValidFileName('../../etc/passwd.md'), false)
        })

        it('rejects path with backslash', function () {
            assert.strictEqual(isValidFileName('..\\..\\etc\\passwd.md'), false)
        })

        it('rejects path with double dots', function () {
            assert.strictEqual(isValidFileName('..secret.md'), false)
        })

        it('allows simple filename', function () {
            assert.strictEqual(isValidFileName('my-prompt.md'), true)
        })

        it('allows filename with spaces', function () {
            assert.strictEqual(isValidFileName('my prompt name.md'), true)
        })

        it('allows filename with single dot', function () {
            assert.strictEqual(isValidFileName('my.prompt.md'), true)
        })
    })

    describe('directory containment check (processFileClickMessage pattern)', function () {
        function isInsideDirectory(baseDir: string, filePath: string): boolean {
            const resolvedBase = path.resolve(baseDir)
            const resolvedPath = path.resolve(baseDir, filePath)
            return resolvedPath.startsWith(resolvedBase + path.sep)
        }

        it('rejects traversal above base directory', function () {
            assert.strictEqual(isInsideDirectory('/workspace/project', '../../etc/passwd'), false)
        })

        it('rejects embedded traversal', function () {
            assert.strictEqual(isInsideDirectory('/workspace/project', 'subdir/../../../etc/shadow'), false)
        })

        it('rejects path that resolves to base dir itself', function () {
            assert.strictEqual(isInsideDirectory('/workspace/project', ''), false)
        })

        it('allows valid relative path', function () {
            assert.strictEqual(isInsideDirectory('/workspace/project', 'src/main.ts'), true)
        })

        it('allows nested valid path', function () {
            assert.strictEqual(isInsideDirectory('/workspace/project', 'a/b/c/file.ts'), true)
        })

        it('allows path with harmless dot-dot that stays within base', function () {
            assert.strictEqual(isInsideDirectory('/workspace/project', 'a/../b/file.ts'), true)
        })
    })
})
