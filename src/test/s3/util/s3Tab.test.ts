/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import * as testutil from '../../testUtil'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { S3Tab } from '../../../s3/util/s3Tab'
import { anything, instance, mock, when, capture } from '../../utilities/mockito'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'

describe('S3Tab', async function () {
    const message = 'can this be read'
    const fileName = 'test.txt'
    const key = 'test.txt'
    const bucketName = 'bucket-name'
    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }

    let tempFolder: string
    let fileUri: vscode.Uri
    let s3Uri: vscode.Uri
    let s3Tab: S3Tab
    let mockedWorkspace: typeof vscode.workspace
    let mockedWindow: typeof vscode.window
    let parentNode: S3BucketNode
    let fileNodeTest: S3FileNode
    let s3: S3Client

    before(async function () {
        s3 = mock()
        mockedWorkspace = mock()
        mockedWindow = mock()
        tempFolder = await makeTemporaryToolkitFolder()
        fileUri = vscode.Uri.file(path.join(tempFolder, fileName))
        s3Uri = vscode.Uri.parse('s3:' + fileUri.fsPath)
        parentNode = new S3BucketNode(bucket, {} as S3Node, instance(s3))
        fileNodeTest = new S3FileNode(
            bucket,
            { name: fileName, key, arn: 'arn', lastModified: undefined, sizeBytes: 16 },
            parentNode,
            instance(s3)
        )

        testutil.toFile(message, fileUri.fsPath)

        s3Tab = new S3Tab(fileUri, fileNodeTest, instance(mockedWindow))
    })

    it('can be opened in read-only mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve({ uri: s3Uri } as any))
        when(mockedWindow.showTextDocument(anything())).thenReturn()

        await s3Tab.openFileOnReadOnly(instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, s3Uri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, s3Uri.scheme)

        const [showDocArgs] = capture(mockedWindow.showTextDocument).last()

        assert.deepStrictEqual((showDocArgs as any).uri, s3Uri)
    })

    it('can be opened in edit mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve({ uri: fileUri } as any))
        when(mockedWindow.showTextDocument(anything())).thenReturn()

        await s3Tab.openFileOnEditMode(instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, fileUri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, fileUri.scheme)

        const [showDocArgs] = capture(mockedWindow.showTextDocument).last()

        assert.deepStrictEqual((showDocArgs as any).uri, fileUri)
    })

    it('saves changes back to s3', async function () {
        when(s3.uploadFile(anything())).thenResolve()
        s3Tab = new S3Tab(fileUri, fileNodeTest, vscode.window)

        const result = await s3Tab.uploadChangesToS3()

        assert.ok(result)

        const [uploadArgs] = capture(s3.uploadFile).last()

        assert.strictEqual(uploadArgs.bucketName, bucketName)
        assert.strictEqual(uploadArgs.key, key)
        assert.deepStrictEqual(uploadArgs.fileLocation, fileUri)
    })
})
