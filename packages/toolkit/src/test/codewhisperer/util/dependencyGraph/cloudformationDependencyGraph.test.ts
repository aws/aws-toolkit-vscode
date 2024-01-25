/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import vscode from 'vscode'
import { cloudformationDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/cloudformationDependencyGraph'
import { getTestWorkspaceFolder } from '../../../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'

describe('cloudformationDependencyGraphJson', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'cloudformation-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'app.json')

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const cloudformationDependency = new cloudformationDependencyGraph(
                'json' satisfies CodeWhispererConstants.PlatformLanguageId
            )
            const truncation = await cloudformationDependency.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})

describe('cloudformationDependencyGraphYaml', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'cloudformation-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'app.yaml')

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const cloudformationDependency = new cloudformationDependencyGraph(
                'yaml' satisfies CodeWhispererConstants.PlatformLanguageId
            )
            const truncation = await cloudformationDependency.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})

describe('cloudformationDependencyGraphYml', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'cloudformation-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'appYml.yml')

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const cloudformationDependency = new cloudformationDependencyGraph(
                'yaml' satisfies CodeWhispererConstants.PlatformLanguageId
            )
            const truncation = await cloudformationDependency.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})
