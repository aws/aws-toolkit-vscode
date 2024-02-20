/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateRepositoryName } from '../../ecr/utils'

describe('createRepositoryCommand', function () {
    it('Validates repository name starts with a lowercase letter', function () {
        const message = validateRepositoryName('404')
        assert.strictEqual(message, 'Repository name must start with a lowercase letter')
    })

    it('Validates repository name does not contain uppercase characters', function () {
        const message = validateRepositoryName('abcDEF')
        assert.strictEqual(
            message,
            'Repository name must only contain lowercase letters, numbers, hyphens, underscores, and forward slashes'
        )
    })

    it('Validates repository name against large regex the service uses', function () {
        ;['abc--a', 'abc//a', 'abc__a', 'abc-', 'abc/', 'abc_'].forEach(item =>
            assert.strictEqual(validateRepositoryName(item), 'Invalid repository name')
        )
    })

    it('Allows lowercase names with slashes, underscores, and dashes', function () {
        const message = validateRepositoryName('abc1/def2/hij3_klmno-p5')
        assert.strictEqual(message, undefined)
    })
})
