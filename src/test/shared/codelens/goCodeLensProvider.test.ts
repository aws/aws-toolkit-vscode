/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as sampleGoSamProgram from './sampleGoSamProgram'

import { writeFile } from 'fs-extra'
import { isValidFuncSignature } from '../../../shared/codelens/goCodeLensProvider'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('getLambdaHandlerCandidates', async function () {
    let tempFolder: string
    let programFile: string
    let dummyMod: string

    before(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder('golenstest')
        programFile = path.join(tempFolder, 'program.go')
        dummyMod = path.join(tempFolder, 'go.mod')

        await writeFile(programFile, sampleGoSamProgram.getFunctionText())
        await writeFile(dummyMod, 'go 1.14')
    })

    after(async function () {
        await fs.remove(tempFolder)
    })

    it('Detects only good function symbols from a mock program', async function () {
        const textDoc: vscode.TextDocument = await vscode.workspace.openTextDocument(programFile)
        const candidates: vscode.DocumentSymbol[] = sampleGoSamProgram
            .getDocumentSymbols()
            .filter(symbol => isValidFuncSignature(textDoc, symbol))

        assert.ok(candidates)
        assert.strictEqual(candidates.length, 2, 'Expected two Lambda Handler components')
        assert.strictEqual(candidates[0].name, 'handler', 'Unexpected handler name')
        assert.strictEqual(candidates[1].name, 'multiLine', 'Unexpected handler name')
    })
})
