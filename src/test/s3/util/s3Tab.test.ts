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

describe.only('S3Tab', async function () {
    const message = 'can this be read'
    const fileName = 'test.txt'

    let openedDoc: vscode.TextDocument
    let openedS3Doc: vscode.TextDocument
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

        openedDoc = await vscode.workspace.openTextDocument(fileUri)

        mockedWorkspace = mock()
        mockedWindow = mock()
        listTempFolder(tempFolder)
        s3Tab = new S3Tab(fileUri, instance(mockedWindow))
    })

    it('can be opened in read-only mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve(openedS3Doc))
        when(mockedWindow.showTextDocument(anything())).thenReturn(Promise.resolve({ document: openedS3Doc } as any))

        await s3Tab.openFileOnReadOnly(instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, s3Uri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, s3Uri.scheme)
    })

    it('can be opened in edit mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve(openedDoc))
        when(mockedWindow.showTextDocument(anything())).thenReturn({ document: openedS3Doc } as any)

        await s3Tab.openFileOnEditMode(instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, fileUri.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, fileUri.scheme)
    })

    it('saves changes back to s3', function () {})
})

function listTempFolder(tempLocation: string) {
    console.log('-------contents in temp:')

    fs.readdirSync(tempLocation!).forEach((file: any) => {
        console.log(` ${file}`)
    })

    console.log('-------------------------')
}
