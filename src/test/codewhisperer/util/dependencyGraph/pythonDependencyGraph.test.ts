/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as fs from 'fs'
import { PythonDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/pythonDependencyGraph'
import { getTestWorkspaceFolder } from '../../../../integrationTest/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'

describe('pythonDependencyGraph', function () {
    const languageId = 'python'
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'python3.7-plain-sam-app')
    const appCodePath = join(appRoot, 'hello_world', 'app.py')

    describe('parseImport', function () {
        beforeEach(function () {
            sinon.stub(fs, 'existsSync').returns(true)
        })
        afterEach(function () {
            sinon.restore()
        })
        it('Should parse and generate dependencies ', function () {
            const pythonDependencyGraph = new PythonDependencyGraph(languageId)
            const dependencies = pythonDependencyGraph.parseImport('from example import test', ['dirPath1', 'dirPath2'])
            assert.strictEqual(dependencies.length, 4)
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'example.py'),
                join('dirPath1', 'example', 'test.py'),
                join('dirPath2', 'example.py'),
                join('dirPath2', 'example', 'test.py'),
            ])
        })
    })

    describe('getDependencies', function () {
        it('Should return expected dependencies', function () {
            const pythonDependencyGraph = new PythonDependencyGraph(languageId)
            const dependencies = pythonDependencyGraph.getDependencies(vscode.Uri.parse(appCodePath), ['import app'])
            assert.strictEqual(dependencies.length, 1)
            assert.ok(appCodePath.includes(dependencies[0]))
        })
    })

    describe('searchDependency', function () {
        it('Should search dependencies and return expected picked source file', async function () {
            const pythonDependencyGraph = new PythonDependencyGraph(languageId)
            const sourceFiles = await pythonDependencyGraph.searchDependency(vscode.Uri.parse(appCodePath))
            assert.strictEqual(sourceFiles.size, 1)
            const [firstFile] = sourceFiles
            assert.ok(appCodePath.includes(firstFile))
        })
    })

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const pythonDependencyGraph = new PythonDependencyGraph(languageId)
            const truncation = await pythonDependencyGraph.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.root.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.src.dir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.src.zip.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.src.size > 0)
        })
    })
})
