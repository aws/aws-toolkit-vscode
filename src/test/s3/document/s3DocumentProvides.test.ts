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

describe('S3DocumentProvider', async function () {
    //make a temprorary directory
    const tempFolder = await makeTemporaryToolkitFolder()
    const fileName = 'test.txt'
    const fileLocation = vscode.Uri.parse('s3:' + path.join(tempFolder, fileName))

    let provider: S3DocumentProvider

    // TODO: Make this less flaky when we add manual timestamp controls.
    const message = "i don't like testing but this one is easy, it should work"

    beforeEach(function () {
        provider = new S3DocumentProvider()
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
