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
import { areEqual } from '../../../shared/utilities/pathUtils'

// TODO: make it a util function inside testUtil.ts
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

            const targetFile = path.join('service', 'microService', 'CodeWhispererFileContextProvider.java')
            const fileWithDistance3 = path.join('service', 'CodewhispererRecommendationService.java')
            const fileWithDistance5 = path.join('util', 'CodeWhispererConstants.java')
            const fileWithDistance6 = path.join('ui', 'popup', 'CodeWhispererPopupManager.java')
            const fileWithDistance7 = path.join('ui', 'popup', 'components', 'CodeWhispererPopup.java')
            const fileWithDistance8 = path.join(
                'ui',
                'popup',
                'components',
                'actions',
                'AcceptRecommendationAction.java'
            )

            const filePaths = [
                fileWithDistance3,
                fileWithDistance5,
                fileWithDistance6,
                fileWithDistance7,
                fileWithDistance8,
            ]
            const shuffledFilePaths = shuffleList(filePaths)

            let cnt = 0
            for (const file of shuffledFilePaths) {
                await openATextEditorWithText(file, file)
                cnt++
                await assertTabSize(cnt)
            }

            const editor = await openATextEditorWithText(targetFile, targetFile)
            await assertTabSize(6)

            const actuals = (await getRelevantCrossFiles(editor)).map(aPath => {
                // for windows path: /C:/Users/RUNNER~1/AppData/Local.../...
                if (aPath.length > 0 && aPath[0] === '/') {
                    return aPath.substring(1)
                } else {
                    return aPath
                }
            })

            assert.ok(actuals.length === 5)
            assert.ok(areEqual(undefined, actuals[0], path.join(tempFolder, fileWithDistance3)))
            assert.ok(areEqual(undefined, actuals[1], path.join(tempFolder, fileWithDistance5)))
            assert.ok(areEqual(undefined, actuals[2], path.join(tempFolder, fileWithDistance6)))
            assert.ok(areEqual(undefined, actuals[3], path.join(tempFolder, fileWithDistance7)))
            assert.ok(areEqual(undefined, actuals[4], path.join(tempFolder, fileWithDistance8)))
        })
    })
})
