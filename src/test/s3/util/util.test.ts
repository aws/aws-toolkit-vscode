/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { readablePath } from '../../../s3/util'

describe('messages', () => {
    describe('readablePath', () => {
        const bucketName = 'bucket-name'
        const bucketPath = ''
        const objectPath = 'path/to/object'

        it('creates a readable path for an S3 bucket', () => {
            const path = readablePath({ bucket: { name: bucketName }, path: bucketPath })

            assert.strictEqual(path, 's3://bucket-name')
        })

        it('creates a readable path for an object in an S3 bucket', () => {
            const path = readablePath({ bucket: { name: bucketName }, path: objectPath })

            assert.strictEqual(path, 's3://bucket-name/path/to/object')
        })
    })
})
