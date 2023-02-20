/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyPathCommand } from '../../../s3/commands/copyPath'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3Client } from '../../../shared/clients/s3Client'
import { FakeEnv } from '../../shared/vscode/fakeEnv'

describe('copyPathCommand', function () {
    it('copies path to clipboard and shows status bar confirmation', async function () {
        const node = createS3FolderNode()

        const env = new FakeEnv()
        await copyPathCommand(node, env)

        assert.strictEqual(env.clipboard.text, 'path')
    })
})

function createS3FolderNode(): S3FolderNode {
    return new S3FolderNode(
        { name: 'name', region: 'region', arn: 'arn' },
        { name: 'name', path: 'path', arn: 'arn ' },
        {} as S3Client
    )
}
