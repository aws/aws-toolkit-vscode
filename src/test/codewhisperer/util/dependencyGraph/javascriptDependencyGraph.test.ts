/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import fs from 'fs'
import { getTestWorkspaceFolder } from '../../../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'
import { JavascriptDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/javascriptDependencyGraph'

describe('javascriptDependencyGraph', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'js-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'app.js')
    const javascriptDependencyGraph = new JavascriptDependencyGraph(
        'javascript' satisfies CodeWhispererConstants.PlatformLanguageId
    )
    describe('parseImport', function () {
        beforeEach(function () {
            sinon.stub(fs, 'existsSync').returns(true)
        })
        afterEach(function () {
            sinon.restore()
        })
        it('Should parse and generate dependencies ', function () {
            const dependencies = javascriptDependencyGraph.parseImport("import * as app from './app'", [
                'dirPath1',
                'dirPath2',
            ])
            assert.strictEqual(dependencies.length, 2)
            assert.deepStrictEqual(dependencies, [join('dirPath1', 'app.js'), join('dirPath2', 'app.js')])
        })
    })

    describe('getDependencies', function () {
        it('Should return expected dependencies', function () {
            const javascriptDependencyGraph = new JavascriptDependencyGraph(
                'javascript' satisfies CodeWhispererConstants.PlatformLanguageId
            )
            const dependencies = javascriptDependencyGraph.getDependencies(vscode.Uri.parse(appCodePath), [
                "import * as app from './app'",
            ])
            assert.strictEqual(dependencies.length, 1)
            assert.ok(appCodePath.includes(dependencies[0]))
        })
    })

    describe('searchDependency', function () {
        it('Should search dependencies and return expected picked source file', async function () {
            const sourceFiles = await javascriptDependencyGraph.searchDependency(vscode.Uri.parse(appCodePath))
            assert.strictEqual(sourceFiles.size, 1)
            const [firstFile] = sourceFiles
            assert.ok(appCodePath.includes(firstFile))
        })
    })

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const truncation = await javascriptDependencyGraph.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})
