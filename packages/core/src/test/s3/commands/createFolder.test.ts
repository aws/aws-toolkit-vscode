/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createFolderCommand } from '../../../s3/commands/createFolder'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { getTestWindow } from '../../shared/vscode/window'

describe('createFolderCommand', function () {
    const invalidFolderNames: { folderName: string; error: string }[] = [
        { folderName: 'contains/delimiter', error: `Folder name must not contain '/'` },
        { folderName: '', error: 'Folder name must not be empty' },
    ]

    const folderName = 'foo'
    const folderPath = 'foo/'
    const bucketName = 'bucket-name'

    let s3: S3Client
    let node: S3BucketNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        s3 = {} as any as S3Client
        node = new S3BucketNode({ name: bucketName, region: 'region', arn: 'arn' }, new S3Node(s3), s3)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for folder name, creates folder, shows success, and refreshes node', async function () {
        const stub = sinon.stub().resolves({
            folder: { name: folderName, path: folderPath, arn: 'arn' },
        })
        s3.createFolder = stub

        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a folder to create in s3://bucket-name')
            assert.strictEqual(input.placeholder, 'Folder Name')
            input.acceptValue(folderName)
        })
        await createFolderCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created folder: foo/)

        assert(stub.calledOnceWithExactly({ path: folderPath, bucketName }))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when prompt is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        await assert.rejects(() => createFolderCommand(node), /cancelled/i)
    })

    it('shows an error message and refreshes node when folder creation fails', async function () {
        const stub = sinon.stub().rejects(new Error('Expected failure'))
        s3.createFolder = stub

        getTestWindow().onDidShowInputBox(input => input.acceptValue(folderName))
        await assert.rejects(() => createFolderCommand(node), /failed to create folder/i)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    invalidFolderNames.forEach(invalid => {
        it(`warns '${invalid.error}' when folder name is '${invalid.folderName}'`, async () => {
            getTestWindow().onDidShowInputBox(input => {
                input.acceptValue(invalid.folderName)
                assert.strictEqual(input.validationMessage, invalid.error)
                input.hide()
            })
            await assert.rejects(() => createFolderCommand(node))
        })
    })
})
