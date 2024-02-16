/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import fs from 'fs'
import { RubyDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/rubyDependencyGraph'
import { getTestWorkspaceFolder } from '../../../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'

describe('rubyDependencyGraph', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'ruby-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'app.rb')
    const rubyDependencyGraph = new RubyDependencyGraph('ruby' satisfies CodeWhispererConstants.PlatformLanguageId)

    describe('parseImport', function () {
        beforeEach(function () {
            sinon.stub(fs, 'existsSync').returns(true)
        })
        afterEach(function () {
            sinon.restore()
        })

        it('Should parse and generate dependencies ', function () {
            const dependencies = rubyDependencyGraph.parseImport(`load 'really_long_module_name' as ShortName`, [
                'dirPath1',
                'dirPath2',
            ])
            assert.strictEqual(dependencies.length, 2)
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'really_long_module_name.rb'),
                join('dirPath2', 'really_long_module_name.rb'),
            ])
        })

        it('Should parse and generate dependencies for include', function () {
            const dependencies = rubyDependencyGraph.parseImport(`include Math`, ['dirPath1'])
            assert.strictEqual(dependencies.length, 1)
            assert.deepStrictEqual(dependencies, [join('dirPath1', 'Math.rb')])

            const dependenciesWithExtend = rubyDependencyGraph.parseImport(`extend app`, ['dirPath1'])
            assert.strictEqual(dependenciesWithExtend.length, 1)
            assert.deepStrictEqual(dependenciesWithExtend, [join('dirPath1', 'app.rb')])
        })

        it('Should parse the imports and generate dependencies ', function () {
            const dependencies = rubyDependencyGraph.parseImport('require "net/http"', [
                'dirPath1',
                'dirPath2',
                'dirPath3',
            ])
            assert.strictEqual(dependencies.length, 6)
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'net.rb'),
                join('dirPath2', 'net.rb'),
                join('dirPath3', 'net.rb'),
                join('dirPath1', 'net', 'http.rb'),
                join('dirPath2', 'net', 'http.rb'),
                join('dirPath3', 'net', 'http.rb'),
            ])
        })

        it('Should parse the imports and generate dependencies if import has extension', function () {
            const dependencies = rubyDependencyGraph.parseImport('require_relative "net/sample.rb"', [
                'dirPath1',
                'dirPath2',
                'dirPath3',
            ])
            assert.strictEqual(dependencies.length, 6)
            assert.deepStrictEqual(dependencies, [
                join('dirPath1', 'net.rb'),
                join('dirPath2', 'net.rb'),
                join('dirPath3', 'net.rb'),
                join('dirPath1', 'net', 'sample.rb'),
                join('dirPath2', 'net', 'sample.rb'),
                join('dirPath3', 'net', 'sample.rb'),
            ])
        })
    })

    describe('getDependencies', function () {
        it('Should return expected dependencies', async function () {
            const dependencies = rubyDependencyGraph.getDependencies(vscode.Uri.parse(appCodePath), ['require "app";'])
            assert.strictEqual(dependencies.length, 1)
            assert.ok(appCodePath.includes(dependencies[0] as string))
        })
    })

    describe('searchDependency', function () {
        it('Should search dependencies and return expected picked source file', async function () {
            const sourceFiles = await rubyDependencyGraph.searchDependency(vscode.Uri.parse(appCodePath))
            assert.strictEqual(sourceFiles.size, 1)
            const [firstFile] = sourceFiles
            assert.ok(appCodePath.includes(firstFile))
        })
    })

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const truncation = await rubyDependencyGraph.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})
