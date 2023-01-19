/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as moment from 'moment'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { s3DateFormat, S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Client } from '../../../shared/clients/s3Client'

describe('S3FileNode', function () {
    const arn = 'arn'
    const name = 'file.jpg'
    const key = 'path/to/file.jpg'
    const sizeBytes = 1024
    const lastModified = new Date(2020, 5, 4, 3, 2, 1)
    const now = new Date(2020, 6, 4)
    const lastModifiedReadable = moment(lastModified).format(s3DateFormat)

    it('creates an S3 File Node', async function () {
        const node = new S3FileNode(
            { name: 'bucket-name', region: 'region', arn: 'arn' },
            { name, key, arn, sizeBytes, lastModified },
            {} as S3BucketNode,
            {} as S3Client,
            now
        )

        assert.ok(node.tooltip?.startsWith(`path/to/file.jpg\nSize: 1 KB\nLast Modified: ${lastModifiedReadable}`))
        assert.ok((node.description as string).startsWith('1 KB, a month ago'))
    })
})
