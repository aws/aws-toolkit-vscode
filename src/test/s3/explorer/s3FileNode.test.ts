/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Client } from '../../../shared/clients/s3Client'

describe('S3FileNode', () => {
    const arn = 'arn'
    const name = 'file.jpg'
    const key = 'path/to/file.jpg'
    const sizeBytes = 1024
    const lastModified = new Date(2020, 5, 4)
    const now = new Date(2020, 6, 4)

    it('creates an S3 File Node', async () => {
        const node = new S3FileNode(
            { name: 'bucket-name', region: 'region', arn: 'arn' },
            { name, key, arn, sizeBytes, lastModified },
            {} as S3Client,
            now
        )
        assert.ok(node.tooltip?.startsWith('path/to/file.jpg\nSize: 1 KB\nLast Modified: a month ago'))
        assert.ok((node.description as string).startsWith('1 KB, a month ago'))
    })
})
