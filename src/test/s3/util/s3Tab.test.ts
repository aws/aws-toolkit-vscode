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
    const message = 'can this be read'
    const fileName = 'test.txt'

    let tempFolder: string
    let fileUri: vscode.Uri
    let s3Uri: vscode.Uri
    let s3Tab: S3Tab
    let mockedWorkspace: typeof vscode.workspace
    let mockedWindow: typeof vscode.window

    before(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        fileUri = vscode.Uri.file(path.join(tempFolder, fileName))
        s3Uri = vscode.Uri.parse('s3:' + fileUri.fsPath)
        testutil.toFile(message, fileUri.fsPath)

        mockedWorkspace = mock()
        mockedWindow = mock()
        listTempFolder(tempFolder)
        s3Tab = new S3Tab(fileUri, instance(mockedWindow))
    })

    it('can be opened in read-only mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve({ uri: s3Uri } as any))
        when(mockedWindow.showTextDocument(anything())).thenReturn()

        await s3Tab.openFileInReadOnly(instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, s3Uri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, s3Uri.scheme)

        const [showDocArgs] = capture(mockedWindow.showTextDocument).last()

        assert.deepStrictEqual((showDocArgs as any).uri, s3Uri)
    })

    it('can be opened in edit mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve({ uri: fileUri } as any))
        when(mockedWindow.showTextDocument(anything())).thenReturn()

        await s3Tab.openFileInEditMode(instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, fileUri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, fileUri.scheme)

        const [showDocArgs] = capture(mockedWindow.showTextDocument).last()

        assert.deepStrictEqual((showDocArgs as any).uri, fileUri)
    })

    it('calls S3 when saving changes', function () {})
})

function listTempFolder(tempLocation: string) {
    console.log('-------contents in temp:')

    fs.readdirSync(tempLocation!).forEach((file: any) => {
        console.log(` ${file}`)
    })

    console.log('-------------------------')
}
