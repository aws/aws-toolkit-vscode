/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import {
    getFileDistance,
    getRelevantCrossFiles,
} from '../../../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { shuffleList, toFile } from '../../testUtil'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('crossfileUtil', function () {
    describe('getFileDistance', function () {
        const targetFile = 'service/microService/CodeWhispererFileContextProvider.java'
        let candidateFile: string

        it('distance 0', function () {
            candidateFile = 'service/microService/CodeWhispererFileCrawler.java'
            const actual = getFileDistance(targetFile, candidateFile, '/')
            assert.strictEqual(actual, 0)
        })

        it('distance 1', function () {
            candidateFile = 'service/CodewhispererRecommendationService.java'
            const actual = getFileDistance(targetFile, candidateFile, '/')
            assert.strictEqual(actual, 1)
        })

        it('distance 3', function () {
            candidateFile = 'util/CodeWhispererConstants.java'
            const actual = getFileDistance(targetFile, candidateFile, '/')
            assert.strictEqual(actual, 3)
        })

        it('distance 4', function () {
            candidateFile = 'ui/popup/CodeWhispererPopupManager.java'
            const actual = getFileDistance(targetFile, candidateFile, '/')
            assert.strictEqual(actual, 4)
        })

        it('distance 5', function () {
            candidateFile = 'ui/popup/components/CodeWhispererPopup.java'
            const actual = getFileDistance(targetFile, candidateFile, '/')
            assert.strictEqual(actual, 5)
        })

        it('distance 6', function () {
            candidateFile = 'ui/popup/components/actions/AcceptRecommendationAction.java'
            const actual = getFileDistance(targetFile, candidateFile, '/')
            assert.strictEqual(actual, 6)
        })
    })

    describe('getRelevantFiles', function () {
        let tempFolder: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
        })

        afterEach(async function () {
            await fs.remove(tempFolder)
        })

        it('should return opened files in the current window and sorted ascendingly by file distance', async function () {
            const targetFile = path.join(tempFolder, 'service', 'microService', 'CodeWhispererFileContextProvider.java')
            const fileWithDistance3 = path.join(tempFolder, 'service', 'CodewhispererRecommendationService.java')
            const fileWithDistance5 = path.join(tempFolder, 'util', 'CodeWhispererConstants.java')
            const fileWithDistance6 = path.join(tempFolder, 'ui', 'popup', 'CodeWhispererPopupManager.java')
            const fileWithDistance7 = path.join(tempFolder, 'ui', 'popup', 'components', 'CodeWhispererPopup.java')
            const fileWithDistance8 = path.join(
                tempFolder,
                'ui',
                'popup',
                'components',
                'actions',
                'AcceptRecommendationAction.java'
            )

            const filePaths = [
                targetFile,
                fileWithDistance8,
                fileWithDistance5,
                fileWithDistance7,
                fileWithDistance3,
                fileWithDistance6,
            ]
            const shuffledFilePaths = shuffleList(filePaths)

            for (const file of shuffledFilePaths) {
                toFile('', file)
                const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
                await vscode.window.showTextDocument(textDocument, { preview: false })
            }

            // to make the target file editor active
            const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFile))
            const editor = await vscode.window.showTextDocument(textDocument)

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
