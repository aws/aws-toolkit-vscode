/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateAuthority } from '../src/authResolver'

describe('authResolver', function () {
    describe('validateAuthority', function () {
        describe('valid hostnames', function () {
            it('accepts sm_lc_ prefix', function () {
                const result = validateAuthority('sm_lc_test-hostname')
                assert.strictEqual(result.hostname, 'sm_lc_test-hostname')
                assert.strictEqual(result.user, undefined)
            })

            it('accepts sm_dl_ prefix', function () {
                const result = validateAuthority('sm_dl_test-hostname')
                assert.strictEqual(result.hostname, 'sm_dl_test-hostname')
                assert.strictEqual(result.user, undefined)
            })

            it('accepts sm_cursor_lc_ prefix', function () {
                const result = validateAuthority('sm_cursor_lc_test-hostname')
                assert.strictEqual(result.hostname, 'sm_cursor_lc_test-hostname')
                assert.strictEqual(result.user, undefined)
            })

            it('accepts sm_cursor_dl_ prefix', function () {
                const result = validateAuthority('sm_cursor_dl_test-hostname')
                assert.strictEqual(result.hostname, 'sm_cursor_dl_test-hostname')
                assert.strictEqual(result.user, undefined)
            })

            it('accepts hp_ prefix', function () {
                const result = validateAuthority('hp_test-hostname')
                assert.strictEqual(result.hostname, 'hp_test-hostname')
                assert.strictEqual(result.user, undefined)
            })

            it('accepts hostname with user', function () {
                const result = validateAuthority('testuser@sm_lc_test-hostname')
                assert.strictEqual(result.hostname, 'sm_lc_test-hostname')
                assert.strictEqual(result.user, 'testuser')
            })

            it('accepts cursor hostname with user', function () {
                const result = validateAuthority('testuser@sm_cursor_lc_test-hostname')
                assert.strictEqual(result.hostname, 'sm_cursor_lc_test-hostname')
                assert.strictEqual(result.user, 'testuser')
            })

            it('accepts hostname with dots and dashes', function () {
                const result = validateAuthority('sm_lc_test.host-name_123')
                assert.strictEqual(result.hostname, 'sm_lc_test.host-name_123')
                assert.strictEqual(result.user, undefined)
            })

            it('accepts hyperpod hostname with complex characters', function () {
                const result = validateAuthority('hp_cluster-name.node-123')
                assert.strictEqual(result.hostname, 'hp_cluster-name.node-123')
                assert.strictEqual(result.user, undefined)
            })
        })

        describe('invalid hostnames', function () {
            it('rejects hostname without valid prefix', function () {
                assert.throws(() => validateAuthority('invalid_prefix_hostname'), /Invalid SageMaker hostname format/)
            })

            it('rejects hostname with only sm_ prefix', function () {
                assert.throws(() => validateAuthority('sm_hostname'), /Invalid SageMaker hostname format/)
            })

            it('rejects hostname with incomplete cursor prefix', function () {
                assert.throws(() => validateAuthority('sm_cursor_hostname'), /Invalid SageMaker hostname format/)
            })

            it('rejects empty hostname', function () {
                assert.throws(() => validateAuthority(''), /Invalid authority format/)
            })

            it('rejects hostname with special characters', function () {
                assert.throws(() => validateAuthority('sm_lc_test@hostname'), /Invalid SageMaker hostname format/)
            })

            it('rejects hostname with spaces', function () {
                assert.throws(() => validateAuthority('sm_lc_test hostname'), /Invalid SageMaker hostname format/)
            })

            it('provides helpful error message for invalid format', function () {
                try {
                    validateAuthority('wrong_format')
                    assert.fail('Should have thrown error')
                } catch (err) {
                    assert.ok(err instanceof Error)
                    assert.ok(
                        err.message.includes(
                            "Expected 'sm_lc_*', 'sm_dl_*', 'sm_cursor_lc_*', 'sm_cursor_dl_*', or 'hp_*' format"
                        )
                    )
                }
            })
        })

        describe('user extraction', function () {
            it('extracts user from authority with @', function () {
                const result = validateAuthority('myuser@sm_lc_hostname')
                assert.strictEqual(result.user, 'myuser')
                assert.strictEqual(result.hostname, 'sm_lc_hostname')
            })

            it('handles user with dots and dashes', function () {
                const result = validateAuthority('my.user-name@sm_cursor_lc_hostname')
                assert.strictEqual(result.user, 'my.user-name')
                assert.strictEqual(result.hostname, 'sm_cursor_lc_hostname')
            })

            it('returns undefined user when no @ present', function () {
                const result = validateAuthority('sm_lc_hostname')
                assert.strictEqual(result.user, undefined)
            })
        })
    })
})
