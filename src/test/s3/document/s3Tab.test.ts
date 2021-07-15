/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import * as testutil from '../../testUtil'
import { S3Tab } from '../../../s3/util/s3Tab'

describe.only('S3Tab', async function () {
    const tempFolder = await makeTemporaryToolkitFolder()
    const message = 'can this be read'
    const fileName = 'test.txt'
    const fileUri = vscode.Uri.file(path.join(tempFolder, fileName))
    //const s3Uri = vscode.Uri.parse('s3:' + fileUri.fsPath)

    testutil.toFile(message, fileUri.fsPath)

    const window = vscode.window
    const s3Tab = new S3Tab(fileUri, window)

    it('can be opened in read-only mode', async function () {
        //get the active text editor
        assert.strictEqual((await s3Tab.openFileOnReadOnly())?.document.fileName, fileName)
        //find the dummy file uri

        //assert that it is the same as the given uri
    })

    it('can be opened in edit mode', function () {})

    it('saves changes back to s3', async function () {})
})
