/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as fs from 'fs'
import { JavaDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/javaDependencyGraph'
import { getTestWorkspaceFolder } from '../../../../integrationTest/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'

describe('javaDependencyGraph', function () {
    const languageId = 'java'
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')

    describe('parseImport', function () {
        beforeEach(function () {
            sinon.stub(fs, 'existsSync').returns(true)
        })
        afterEach(function () {
            sinon.restore()
        })
        it('Should parse and generate dependencies ', function () {
            const javaDependencyGraph = new JavaDependencyGraph(languageId)
            const dependencies = javaDependencyGraph.parseImport(
                'import com.amazon.aws.vector.consolas.runtimeservice;',
                ['dirPath1', 'dirPath2']
            )
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'com', 'amazon', 'aws', 'vector', 'consolas', 'runtimeservice.java'),
                join('dirPath2', 'com', 'amazon', 'aws', 'vector', 'consolas', 'runtimeservice.java'),
            ])
        })
    })

    describe('getDependencies', function () {
        it('Should return expected dependencies', function () {
            const importStr = 'import java11-plain-maven-sam-app.HelloWorldFunction.src.main.java.helloworld.App;'
            const javaDependencyGraph = new JavaDependencyGraph(languageId)
            const dependencies = javaDependencyGraph.getDependencies(vscode.Uri.parse(appRoot), [importStr])
            assert.strictEqual(dependencies.length, 1)
            assert.ok(appCodePath.includes(dependencies[0]))
        })
    })

    describe('searchDependency', function () {
        it('Should search dependencies and return expected picked source file', async function () {
            const javaDependencyGraph = new JavaDependencyGraph(languageId)
            const sourceFiles = await javaDependencyGraph.searchDependency(vscode.Uri.parse(appCodePath))
            assert.strictEqual(sourceFiles.size, 1)
            const [firstFile] = sourceFiles
            assert.ok(appCodePath.includes(firstFile))
        })
    })

    describe('generateTruncation', function () {
        beforeEach(function () {
            sinon.stub(JavaDependencyGraph.prototype, <any>'generateBuildFilePaths').returns([appCodePath])
        })
        afterEach(function () {
            sinon.restore()
        })
        it('Should generate and return expected truncation', async function () {
            const javaDependencyGraph = new JavaDependencyGraph(languageId)
            sinon.stub(javaDependencyGraph, <any>'_outputDirs').value(new Set<string>('build'))
            const truncation = await javaDependencyGraph.generateTruncation(vscode.Uri.parse(appCodePath))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.root.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.src.size > 0)
            assert.ok(truncation.src.dir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.src.zip.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
        })
    })
})
