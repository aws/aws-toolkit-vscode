/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { getRelevantCrossFiles } from '../../../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { shuffleList, assertTextEditorContains, closeAllEditors, toFile } from '../../testUtil'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { normalize } from '../../../shared/utilities/pathUtils'

// TODO: make it a util functio inside testUtil.ts
let tempFolder: string

async function openATextEditorWithText(fileText: string, fileName: string): Promise<vscode.TextEditor> {
    const completeFilePath = path.join(tempFolder, fileName)
    toFile(fileText, completeFilePath)

    const textDocument = await vscode.workspace.openTextDocument(completeFilePath)

    return await vscode.window.showTextDocument(textDocument)
}

describe('crossfileUtil', function () {
    describe('getRelevantFiles', function () {
        before(async function () {
            this.timeout(600000)
        })

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
        })

        afterEach(async function () {
            await fs.remove(tempFolder)
        })

        after(async function () {
            await closeAllEditors()
        })

        it('should return opened files in the current window and sorted ascendingly by file distance', async function () {
            const targetFile = 'service/microService/CodeWhispererFileContextProvider.java'
            const fileWithDistance3 = 'service/CodewhispererRecommendationService.java'
            const fileWithDistance5 = 'util/CodeWhispererConstants.java'
            const fileWithDistance6 = 'ui/popup/CodeWhispererPopupManager.java'
            const fileWithDistance7 = 'ui/popup/components/CodeWhispererPopup.java'
            const fileWithDistance8 = 'ui/popup/components/actions/AcceptRecommendationAction.java'

            const filePaths = [
                fileWithDistance8,
                fileWithDistance5,
                fileWithDistance7,
                fileWithDistance3,
                fileWithDistance6,
            ]
            const shuffledFilePaths = shuffleList(filePaths)

            for (const file of shuffledFilePaths) {
                await openATextEditorWithText(file, file)
                await assertTextEditorContains(file)
            }

            // to make the target file editor active
            const editor = await openATextEditorWithText(targetFile, targetFile)
            await assertTextEditorContains(targetFile)

            const actual = await getRelevantCrossFiles(editor)
            assert.deepStrictEqual(actual, [
                normalize(fileWithDistance3),
                normalize(fileWithDistance5),
                normalize(fileWithDistance6),
                normalize(fileWithDistance7),
                normalize(fileWithDistance8),
            ])
        })
    })
})
