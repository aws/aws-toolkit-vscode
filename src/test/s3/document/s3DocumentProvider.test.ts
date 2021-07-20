/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as testutil from '../../testUtil'
import * as path from 'path'
import { S3DocumentProvider } from '../../../s3/document/s3DocumentProvider'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

class ChangeEmitter {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    public fire(): void {
        this._onDidChange.fire()
    }
}

describe('S3DocumentProvider', async function () {
    const changeEmitter = new ChangeEmitter()

    //make a temprorary directory
    const fileName = 'test.txt'
    const message = "i don't like testing but this one is easy, it should work"

    let tempFolder: string
    let fileLocation: vscode.Uri
    let provider: S3DocumentProvider
    before(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        fileLocation = vscode.Uri.parse('s3:' + path.join(tempFolder, fileName))
    })

    // TODO: Make this less flaky when we add manual timestamp controls.
    beforeEach(async function () {
        provider = new S3DocumentProvider(changeEmitter.onDidChange)
    })

    it('provides content if file exists and a blank string if it does not', async function () {
        //try to read a file that doesn't exist yet
        assert.strictEqual(await provider.provideTextDocumentContent(fileLocation), '')

        //place a file in there
        // get the file's fsPath
        //try to read the file now
        testutil.toFile(message, fileLocation.fsPath)

        assert.strictEqual(await provider.provideTextDocumentContent(fileLocation), message)
    })
})
