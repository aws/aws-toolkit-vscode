/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import * as testutil from '../../testUtil'
import { S3Tab } from '../../../s3/util/s3Tab'
import { anything, instance, mock, when, capture } from '../../utilities/mockito'

describe('S3Tab', async function () {
    console.log('14')
    const message = 'can this be read'
    const fileName = 'test.txt'

    let tempFolder: string
    let fileUri: vscode.Uri
    let s3Uri: vscode.Uri
    let s3Tab: S3Tab
    let workspace: typeof vscode.workspace
    let window: typeof vscode.window

    before(async function () {
        workspace = mock()
        window = mock()
        tempFolder = await makeTemporaryToolkitFolder()
        fileUri = vscode.Uri.file(path.join(tempFolder, fileName))
        s3Uri = vscode.Uri.parse('s3:' + fileUri.fsPath)
        testutil.toFile(message, fileUri.fsPath)
        listTempFolder(tempFolder)
        s3Tab = new S3Tab(fileUri, instance(window))
    })

    it('can be opened in read-only mode', async function () {
        when(workspace.openTextDocument(anything())).thenReturn()
        when(window.showTextDocument(anything())).thenReturn()

        //get the active text editor
        await s3Tab.openFileOnReadOnly(instance(workspace))

        const [uri] = capture(workspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, s3Uri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, s3Uri.scheme)

        //find the dummy file uri

        //assert that it is the same as the given uri
    })

    it('can be opened in edit mode', function () {})

    it('saves changes back to s3', function () {})
})

function listTempFolder(tempLocation: string) {
    console.log('-------contents in temp:')

    fs.readdirSync(tempLocation!).forEach((file: any) => {
        console.log(` ${file}`)
    })

    console.log('-------------------------')
}
