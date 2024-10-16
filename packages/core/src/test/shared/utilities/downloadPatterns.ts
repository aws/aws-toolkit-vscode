/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { getPattern } from '../../../shared/utilities/downloadPatterns'
import { createTestWorkspaceFolder } from '../../testUtil'
import { fs } from '../../../shared'

describe('try', () => {
    let tempFolder: vscode.Uri

    beforeEach(async () => {
        tempFolder = (await createTestWorkspaceFolder()).uri
    })

    afterEach(async () => {
        try {
            await fs.delete(tempFolder.fsPath, { recursive: true, force: true })
        } catch (err) {
            assert.fail(`Error deleting temporary folder ${tempFolder.fsPath}: ${err}`)
        }
    })

    // This checks if the code's zip got extracted to destination folder
    describe('getPattern', () => {
        it('should extract the zip file to the output directory', async () => {
            const owner = 'aws-samples'
            const repoName = 'serverless-patterns'
            const assetName = 'activemq-lambda.zip'

            console.log(`Downloading zip file`)
            await getPattern(owner, repoName, assetName, tempFolder)

            console.log(`Extracting zip file to ${tempFolder.fsPath}`)
            const folderContents = await fs.readdir(tempFolder.fsPath)
            console.log(`Contents of ${tempFolder.fsPath}:`, folderContents)

            const expectedFolderPath = path.join(tempFolder.fsPath, 'activemq-lambda')
            console.log(`Expected folder path: ${expectedFolderPath}`)
            assert.ok(await fs.exists(expectedFolderPath), `Expected folder ${expectedFolderPath} not found`)
        })
    })
})
