/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as fs from 'fs'
import { PythonDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/pythonDependencyGraph'
import * as fsUtil from '../../../../shared/filesystemUtilities'
import { getTestWorkspaceFolder } from '../../../../integrationTest/integrationTestsUtilities'
import { join } from 'path'
import { CodeWhispererConstants } from '../../../../codewhisperer/models/constants'

describe('pythonDependencyGraph', function () {
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
            const pythonDependencyGraph = new PythonDependencyGraph()
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
            const pythonDependencyGraph = new PythonDependencyGraph()
            const dependencies = pythonDependencyGraph.getDependencies(vscode.Uri.parse(appCodePath), ['import app'])
            assert.strictEqual(dependencies.length, 1)
            assert.ok(appCodePath.includes(dependencies[0]))
        })
    })

    describe('searchDependency', function () {
        it('Should called methods to search dependencies', function () {
            const statSyncSpy = sinon.spy(fs, 'statSync')
            const readFileAsStringSpy = sinon.spy(fsUtil, 'readFileAsString')

            const pythonDependencyGraph = new PythonDependencyGraph()
            pythonDependencyGraph.searchDependency(vscode.Uri.parse(appCodePath))
            assert.ok(statSyncSpy.called)
            assert.ok(readFileAsStringSpy.calledOnce)
        })
    })

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const pythonDependencyGraph = new PythonDependencyGraph()
            const truncation = await pythonDependencyGraph.generateTruncation(vscode.Uri.parse(appCodePath))
            assert.ok(truncation.root.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.src.dir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.src.zip.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            // TODO: bring back the below assertions after the following bug is fixed:
            // https://sim.amazon.com/issues/ConsolasIssue-3777

            // assert.ok(truncation.lines > 0)
            // assert.ok(truncation.src.size > 0)
        })
    })
})
