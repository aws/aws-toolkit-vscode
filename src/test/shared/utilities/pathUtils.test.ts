/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import {
    dirnameWithTrailingSlash,
    getNormalizedRelativePath,
    normalizeSeparator,
    removeDriveLetter,
    normalize,
} from '../../../shared/utilities/pathUtils'

describe('getNormalizedRelativePath', async () => {
    it('returns expected path', async () => {
        const workspaceFolderPath = path.join('my', 'workspace')
        const expectedRelativePath = path.join('processors', 'template.yaml')
        const templatePath = path.join(workspaceFolderPath, expectedRelativePath)

        const relativePath = getNormalizedRelativePath(workspaceFolderPath, templatePath)

        assert.strictEqual(relativePath, expectedRelativePath.replace(path.sep, path.posix.sep))
    })
})

describe('dirnameWithTrailingSlash', async () => {
    it('Adds a trailing slash to a parent folder', async () => {
        const expectedResult = path.join('src', 'processors') + path.sep
        const input = path.join(expectedResult, 'app.js')
        const actualResult = dirnameWithTrailingSlash(input)

        assert.strictEqual(actualResult, expectedResult, 'Expected path to contain trailing slash')
    })
})

describe('pathUtils', async () => {
    it('normalizeSeparator()', () => {
        assert.strictEqual(normalizeSeparator('a/b/c'), 'a/b/c')
        assert.strictEqual(normalizeSeparator('a\\b\\c'), 'a/b/c')
        assert.strictEqual(normalizeSeparator('a\\\\b\\c\\/\\'), 'a/b/c/')
        assert.strictEqual(normalizeSeparator('/a\\\\b\\c\\/\\/'), '/a/b/c/')
        assert.strictEqual(normalizeSeparator('//\\\\\\\\/\\//'), '/')
        assert.strictEqual(normalizeSeparator('a\\b\\c'), 'a/b/c')
        assert.strictEqual(normalizeSeparator('//////'), '/')
        assert.strictEqual(normalizeSeparator('//UNC///////path'), '//UNC/path')
        assert.strictEqual(normalizeSeparator('\\\\UNC\\path'), '//UNC/path')
        assert.strictEqual(normalizeSeparator('/'), '/')
        assert.strictEqual(normalizeSeparator(''), '')

        // Preserves double-slash at start (UNC path).
        assert.strictEqual(
            normalizeSeparator('\\\\codebuild\\tmp\\output\\js-manifest-in-root\\'),
            '//codebuild/tmp/output/js-manifest-in-root/'
        )
    })

    it('removeDriveLetter()', () => {
        assert.strictEqual(removeDriveLetter('c:\\foo\\bar.txt'), '\\foo\\bar.txt')
        assert.strictEqual(removeDriveLetter('C:\\foo\\bar.txt'), '\\foo\\bar.txt')
        assert.strictEqual(removeDriveLetter('c:/foo/bar.txt'), '/foo/bar.txt')
        assert.strictEqual(removeDriveLetter('c:/foo'), '/foo')
        assert.strictEqual(removeDriveLetter('/foo/bar.txt'), '/foo/bar.txt')
        assert.strictEqual(removeDriveLetter('/foo/bar'), '/foo/bar')
        assert.strictEqual(removeDriveLetter('/foo/'), '/foo/')
        assert.strictEqual(removeDriveLetter('//'), '//')
        assert.strictEqual(removeDriveLetter('/'), '/')
        assert.strictEqual(removeDriveLetter(''), '')
    })

    it('normalize()', () => {
        assert.strictEqual(normalize('../../FOO/BAR'), '../../FOO/BAR')
        assert.strictEqual(normalize('c:\\foo\\bar.txt'), 'C:/foo/bar.txt')
        assert.strictEqual(normalize('C:\\foo\\bar.txt'), 'C:/foo/bar.txt')
        assert.strictEqual(normalize('c:/foo/bar.txt'), 'C:/foo/bar.txt')
        assert.strictEqual(normalize('c:/foo'), 'C:/foo')
        assert.strictEqual(normalize('/foo/bar.txt'), '/foo/bar.txt')
        assert.strictEqual(normalize('/foo/bar'), '/foo/bar')
        assert.strictEqual(normalize('\\foo/bar\\'), '/foo/bar/')
        assert.strictEqual(normalize('/foo/'), '/foo/')
        assert.strictEqual(normalize('//////'), '/')
        assert.strictEqual(normalize('//UNC///////path'), '//UNC/path')
        assert.strictEqual(normalize('\\\\UNC\\path'), '//UNC/path')
        assert.strictEqual(normalize('/'), '/')
        assert.strictEqual(normalize(''), '')
        assert.strictEqual(normalize('a/b/c'), 'a/b/c')

        // Preserves double-slash at start (UNC path).
        assert.strictEqual(
            normalize('\\\\codebuild\\tmp\\output\\js-manifest-in-root\\'),
            '//codebuild/tmp/output/js-manifest-in-root/'
        )
    })
})
