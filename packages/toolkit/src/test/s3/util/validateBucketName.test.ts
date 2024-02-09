/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateBucketName } from '../../../s3/util'

describe('validateBucketName', function () {
    const invalidErrors: { bucketNames: string[]; error: string }[] = [
        { bucketNames: ['a', 'aa', 'a'.repeat(64)], error: 'Bucket name must be between 3 and 63 characters long' },
        { bucketNames: ['-bucket'], error: 'Bucket name must start with a lowercase letter or number' },
        { bucketNames: ['bucket-'], error: 'Bucket name must end with a lowercase letter or number' },
        {
            bucketNames: ['til~de', 'under_score', 'quo"te', 'paren(theses', 'sla/sh'],
            error: 'Bucket name must only contain lowercase letters, numbers, hyphens, and periods',
        },
        {
            bucketNames: ['buck..et', 'buck.-et', 'buck-.et'],
            error: 'Periods in bucket name must be surrounded by a lowercase letter or number',
        },
        { bucketNames: ['127.0.0.1'], error: 'Bucket name must not resemble an IP address' },
    ]

    it('returns undefined for a valid bucket name', function () {
        assert.strictEqual(validateBucketName('v.4.l1d.buc.ket-n4.m3'), undefined)
    })

    invalidErrors.forEach(invalid => {
        describe(invalid.error, () => {
            invalid.bucketNames.forEach(bucketName => {
                it(bucketName, () => {
                    assert.strictEqual(validateBucketName(bucketName), invalid.error)
                })
            })
        })
    })
})
