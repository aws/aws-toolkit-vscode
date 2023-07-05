/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { getRelevantCrossFiles } from '../../../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { shuffleList, toFile, assertTextEditorContains } from '../../testUtil'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

// TODO: make it a util functio inside testUtil.ts
async function openATextEditor(completeFilePath: string): Promise<vscode.TextEditor> {
    toFile('', completeFilePath)
    const textDocument = await vscode.workspace.openTextDocument(completeFilePath)
    return await vscode.window.showTextDocument(textDocument, { preview: false })
}

describe('crossfileUtil', function () {
    describe('getRelevantFiles', function () {
        let tempFolder: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
        })

        afterEach(async function () {
            await fs.remove(tempFolder)
        })

        it('should return opened files in the current window and sorted ascendingly by file distance', async function () {
            const targetFile = path.join(tempFolder, 'service/microService/CodeWhispererFileContextProvider.java')
            const fileWithDistance3 = path.join(tempFolder, 'service/CodewhispererRecommendationService.java')
            const fileWithDistance5 = path.join(tempFolder, 'util/CodeWhispererConstants.java')
            const fileWithDistance6 = path.join(tempFolder, 'ui/popup/CodeWhispererPopupManager.java')
            const fileWithDistance7 = path.join(tempFolder, 'ui/popup/components/CodeWhispererPopup.java')
            const fileWithDistance8 = path.join(
                tempFolder,
                'ui/popup/components/actions/AcceptRecommendationAction.java'
            )

            const filePaths = [
                fileWithDistance8,
                fileWithDistance5,
                fileWithDistance7,
                fileWithDistance3,
                fileWithDistance6,
            ]
            const shuffledFilePaths = shuffleList(filePaths)

            for (const file of shuffledFilePaths) {
                await openATextEditor(file)
                assertTextEditorContains('')
            }

            // to make the target file editor active
            const editor = await openATextEditor(targetFile)
            assertTextEditorContains('')

            const actual = await getRelevantCrossFiles(editor)
            assert.deepStrictEqual(actual, [
                fileWithDistance3,
                fileWithDistance5,
                fileWithDistance6,
                fileWithDistance7,
                fileWithDistance8,
            ])
        })
    })
})
