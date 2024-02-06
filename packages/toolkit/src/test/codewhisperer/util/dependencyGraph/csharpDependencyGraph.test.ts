/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import fs from 'fs'
import { CsharpDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/csharpDependencyGraph'
import { getTestWorkspaceFolder } from '../../../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'

describe('csharpDependencyGraph', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'csharp6-zip')
    const appCodePath = join(appRoot, 'src', 'HelloWorld', 'Function.cs')
    const csharpDependencyGraph = new CsharpDependencyGraph(
        'csharp' satisfies CodeWhispererConstants.PlatformLanguageId
    )
    describe('parseImport', function () {
        beforeEach(function () {
            sinon.stub(fs, 'existsSync').returns(true)
        })
        afterEach(function () {
            sinon.restore()
        })

        it('Should parse and generate dependencies ', function () {
            const dependencies = csharpDependencyGraph.parseImport('global using e = Example.Test', [
                'dirPath1',
                'dirPath2',
            ])
            assert.strictEqual(dependencies.length, 4)
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'Example.cs'),
                join('dirPath2', 'Example.cs'),
                join('dirPath1', 'Example', 'Test.cs'),
                join('dirPath2', 'Example', 'Test.cs'),
            ])
        })

        it('Should parse the imports and generate dependencies ', function () {
            const dependencies = csharpDependencyGraph.parseImport('using static CsharpTest.Example.MockUnitTest', [
                'dirPath1',
                'dirPath2',
                'dirPath3',
            ])
            assert.strictEqual(dependencies.length, 9)
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'CsharpTest.cs'),
                join('dirPath2', 'CsharpTest.cs'),
                join('dirPath3', 'CsharpTest.cs'),
                join('dirPath1', 'CsharpTest', 'Example.cs'),
                join('dirPath2', 'CsharpTest', 'Example.cs'),
                join('dirPath3', 'CsharpTest', 'Example.cs'),
                join('dirPath1', 'CsharpTest', 'Example', 'MockUnitTest.cs'),
                join('dirPath2', 'CsharpTest', 'Example', 'MockUnitTest.cs'),
                join('dirPath3', 'CsharpTest', 'Example', 'MockUnitTest.cs'),
            ])
        })
    })

    describe('getDependencies', function () {
        it('Should return expected dependencies', async function () {
            const dependencies = csharpDependencyGraph.getDependencies(vscode.Uri.parse(appCodePath), [
                'using Function;',
            ])
            assert.strictEqual(dependencies.length, 1)
            assert.ok(appCodePath.includes(dependencies[0] as string))
        })
    })

    describe('searchDependency', function () {
        it('Should search dependencies and return expected picked source file', async function () {
            const sourceFiles = await csharpDependencyGraph.searchDependency(vscode.Uri.parse(appCodePath))
            assert.strictEqual(sourceFiles.size, 1)
            const [firstFile] = sourceFiles
            assert.ok(appCodePath.includes(firstFile))
        })
    })

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const truncation = await csharpDependencyGraph.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })

    describe('isTestFile', () => {
        it('should return true if the file contains relevant test imports', async () => {
            const content = `
                \nusing Xunit;\n
                \nusing NUnit.Framework;\n
                \nusing Microsoft.VisualStudio.TestTools.UnitTesting;\n

                # your test code goes here`
            const isTestFile = await csharpDependencyGraph.isTestFile(content)
            assert.strictEqual(isTestFile, true)
        })

        it('should return false if the file does not contain any relevant test imports', async () => {
            const content = `
                \nusing requests\n

                # your non-test code goes here`

            const isTestFile = await csharpDependencyGraph.isTestFile(content)
            assert.strictEqual(isTestFile, false)
        })
    })
})
