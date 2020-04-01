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

describe('normalizeSeparator', async () => {
    it('normalizes separators', async () => {
        const actual = normalizeSeparator(`a${path.sep}b${path.sep}c`)

        assert.strictEqual(actual, 'a/b/c')
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
