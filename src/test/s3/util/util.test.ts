/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { readablePath } from '../../../s3/util'

describe('messages', function () {
    describe('readablePath', function () {
        const bucketName = 'bucket-name'
        const bucketPath = ''
        const objectPath = 'path/to/object'

        it('creates a readable path for an S3 bucket', function () {
            const path = readablePath({ bucket: { name: bucketName }, path: bucketPath })

            assert.strictEqual(path, 's3://bucket-name')
        })

        it('creates a readable path for an object in an S3 bucket', function () {
            const path = readablePath({ bucket: { name: bucketName }, path: objectPath })

            assert.strictEqual(path, 's3://bucket-name/path/to/object')
        })
    })
})
