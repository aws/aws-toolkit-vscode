/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateClusterName, validateInstanceName, validatePassword, validateUsername } from '../../docdb/utils'

describe('validateClusterName', function () {
    it('validates', function () {
        assert.strictEqual(validateClusterName(''), 'Cluster name must be between 1 and 63 characters long')
        assert.strictEqual(validateClusterName('c'.repeat(64)), 'Cluster name must be between 1 and 63 characters long')
        assert.strictEqual(validateClusterName('404'), 'Cluster name must start with a lowercase letter')
        assert.strictEqual(
            validateClusterName('abcDEF'),
            'Cluster name must only contain lowercase letters, numbers, and hyphens'
        )
        assert.strictEqual(
            validateClusterName('abc-'),
            'Cluster name cannot end with a hyphen or contain 2 consecutive hyphens'
        )
        assert.strictEqual(
            validateClusterName('a--b'),
            'Cluster name cannot end with a hyphen or contain 2 consecutive hyphens'
        )
        assert.strictEqual(validateClusterName('a-2'), undefined)
    })
})

describe('validateUsername', function () {
    it('validates', function () {
        assert.strictEqual(validateUsername(''), 'Username name must be between 1 and 63 characters long')
        assert.strictEqual(validateUsername('x'.repeat(64)), 'Username name must be between 1 and 63 characters long')
        assert.strictEqual(validateUsername('123'), 'Username must start with a letter')
        assert.strictEqual(validateUsername('a2Z'), undefined)
    })
})

describe('validatePassword', function () {
    it('validates', function () {
        assert.strictEqual(validatePassword('passw0rd |~'), undefined)
        assert.strictEqual(validatePassword('1234567'), 'Password must be between 8 and 100 characters long')
        assert.strictEqual(validatePassword('x'.repeat(101)), 'Password must be between 8 and 100 characters long')

        for (const item of ['pass/word', 'p@ssword', '"password"']) {
            assert.strictEqual(
                validatePassword(item),
                'Password must only contain printable ASCII characters (except for slash, double quotes and @ symbol)'
            )
        }

        for (const item of ['password\x19', 'password\u{fe0f}']) {
            assert.strictEqual(
                validatePassword(item),
                'Password must only contain printable ASCII characters (except for slash, double quotes and @ symbol)'
            )
        }
    })
})

describe('validateInstanceName', function () {
    it('validates', function () {
        assert.strictEqual(validateInstanceName(''), 'Instance name must be between 1 and 63 characters long')
        assert.strictEqual(
            validateInstanceName('c'.repeat(64)),
            'Instance name must be between 1 and 63 characters long'
        )
        assert.strictEqual(validateInstanceName('404'), 'Instance name must start with a lowercase letter')
        assert.strictEqual(
            validateInstanceName('abcDEF'),
            'Instance name must only contain lowercase letters, numbers, and hyphens'
        )
        assert.strictEqual(
            validateInstanceName('abc-'),
            'Instance name cannot end with a hyphen or contain 2 consecutive hyphens'
        )
        assert.strictEqual(
            validateInstanceName('a--b'),
            'Instance name cannot end with a hyphen or contain 2 consecutive hyphens'
        )
        assert.strictEqual(validateInstanceName('a-2'), undefined)
    })
})
