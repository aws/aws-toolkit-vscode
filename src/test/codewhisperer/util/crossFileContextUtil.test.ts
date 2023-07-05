/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as semver from 'semver'
import { getRelevantCrossFiles } from '../../../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { shuffleList, closeAllEditors, toFile, assertTabSize } from '../../testUtil'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { normalize } from '../../../shared/utilities/pathUtils'

// TODO: make it a util functio inside testUtil.ts
let tempFolder: string

async function openATextEditorWithText(fileText: string, fileName: string): Promise<vscode.TextEditor> {
    const completeFilePath = path.join(tempFolder, fileName)
    toFile(fileText, completeFilePath)

    const textDocument = await vscode.workspace.openTextDocument(completeFilePath)

    return await vscode.window.showTextDocument(textDocument, { preview: false })
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
            const shouldRunTheTest = semver.valid(vscode.version) && semver.gte(vscode.version, '1.68.0')

            if (!shouldRunTheTest) {
                this.skip()
            }

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
            let cnt = 0
            for (const file of shuffledFilePaths) {
                await openATextEditorWithText(file, file)
                cnt++
                await assertTabSize(cnt)
            }

            // to make the target file editor active
            const editor = await openATextEditorWithText(targetFile, targetFile)
            await assertTabSize(shuffledFilePaths.length + 1)

            const actual = await getRelevantCrossFiles(editor)
            assert.deepStrictEqual(actual, [
                normalize(tempFolder + '/' + fileWithDistance3),
                normalize(tempFolder + '/' + fileWithDistance5),
                normalize(tempFolder + '/' + fileWithDistance6),
                normalize(tempFolder + '/' + fileWithDistance7),
                normalize(tempFolder + '/' + fileWithDistance8),
            ])
        })
    })
})
