/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as sampleGoSamProgram from './sampleGoSamProgram'

import { writeFile } from 'fs-extra'
import { getLambdaHandlerCandidates, isValidFuncSignature } from '../../../shared/codelens/goCodeLensProvider'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { LambdaHandlerCandidate } from '../../../shared/lambdaHandlerSearch'

describe('getLambdaHandlerCandidates', async function () {
    let tempFolder: string
    let programFile: string
    let provider: vscode.Disposable

    before(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
        programFile = path.join(tempFolder, 'program.go')
        await writeFile(programFile, sampleGoSamProgram.getFunctionText())
        provider = vscode.languages.registerDocumentSymbolProvider([{ language: 'go', scheme: 'file' }], {
            provideDocumentSymbols: doc => {
                if (doc.getText() === sampleGoSamProgram.getFunctionText()) {
                    return sampleGoSamProgram.getDocumentSymbols()
                }

                return []
            },
        })
    })

    after(async function () {
        await fs.remove(tempFolder)
        provider.dispose()
    })

    it('Detects only good function symbols', async function () {
        const textDoc: vscode.TextDocument = await vscode.workspace.openTextDocument(programFile)
        const candidates: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates(textDoc)

        assert.ok(candidates)
        assert.strictEqual(candidates.length, 1, 'Expected only one set of Lambda Handler components')
        assert.strictEqual(candidates[0].handlerName, 'handler', 'Unexpected handler name')
    })
})
