/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateClusterName, validatePassword, validateUsername } from '../../docdb/utils'

describe('validateClusterName', function () {
    it('Validates cluster name is not blank', function () {
        const message = validateClusterName('')
        assert.strictEqual(message, 'Cluster name must be between 1 and 63 characters long')
    })

    it('Validates cluster name is not too long', function () {
        const message = validateClusterName('c'.repeat(64))
        assert.strictEqual(message, 'Cluster name must be between 1 and 63 characters long')
    })

    it('Validates cluster name starts with a lowercase letter', function () {
        const message = validateClusterName('404')
        assert.strictEqual(message, 'Cluster name must start with a lowercase letter')
    })

    it('Validates cluster name does not contain uppercase characters', function () {
        const message = validateClusterName('abcDEF')
        assert.strictEqual(message, 'Cluster name must only contain lowercase letters, numbers, and hyphens')
    })

    it('Validates cluster name does not end with a dash', function () {
        const message = validateClusterName('abc-')
        assert.strictEqual(message, 'Cluster name cannot end with a hyphen or contain 2 consecutive hyphens')
    })

    it("Validates cluster name does not contain '--'", function () {
        const message = validateClusterName('a--b')
        assert.strictEqual(message, 'Cluster name cannot end with a hyphen or contain 2 consecutive hyphens')
    })

    it('Allows lowercase names with numbers and dashes', function () {
        const message = validateClusterName('a-2')
        assert.strictEqual(message, undefined)
    })
})

describe('validateUsername', function () {
    it('Validates username is not blank', function () {
        const message = validateUsername('')
        assert.strictEqual(message, 'Username name must be between 1 and 63 characters long')
    })

    it('Validates username is not too long', function () {
        const message = validateUsername('x'.repeat(64))
        assert.strictEqual(message, 'Username name must be between 1 and 63 characters long')
    })

    it('Validates username starts with a letter', function () {
        const message = validateUsername('123')
        assert.strictEqual(message, 'Username must start with a letter')
    })

    it('Allows usernames with letters and numbers', function () {
        const message = validateUsername('a2Z')
        assert.strictEqual(message, undefined)
    })
})

describe('validatePassword', function () {
    it('Validates password is not too short', function () {
        const message = validatePassword('1234567')
        assert.strictEqual(message, 'Password must be between 8 and 100 characters long')
    })

    it('Validates password is not too long', function () {
        const message = validatePassword('x'.repeat(101))
        assert.strictEqual(message, 'Password must be between 8 and 100 characters long')
    })

    it('Validates password does not include slash, double quote or @ symbol', function () {
        ;['pass/word', 'p@ssword', '"password"'].forEach(item =>
            assert.strictEqual(
                validatePassword(item),
                'Password must only contain printable ASCII characters (except for slash, double quotes and @ symbol)'
            )
        )
    })

    it('Validates password does not include non-printable ASCII characters', function () {
        ;['password\x19', 'password\u{fe0f}'].forEach(item =>
            assert.strictEqual(
                validatePassword(item),
                'Password must only contain printable ASCII characters (except for slash, double quotes and @ symbol)'
            )
        )
    })

    it('Allows passwords with printable ASCII characters', function () {
        const message = validatePassword('passw0rd |~')
        assert.strictEqual(message, undefined)
    })
})
