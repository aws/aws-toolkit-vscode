/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import vscode from 'vscode'
import { terraformDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/terraformDependencyGraph'
import { getTestWorkspaceFolder } from '../../../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'

describe('terraformTfDependencyGraph', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'terraform-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'app.tf')

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const terraformTfDependency = new terraformDependencyGraph(
                'tf' satisfies CodeWhispererConstants.PlatformLanguageId
            )
            const truncation = await terraformTfDependency.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})
describe('terraformHclDependencyGraph', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'terraform-plain-sam-app')
    const appCodePath = join(appRoot, 'src', 'app.hcl')

    describe('generateTruncation', function () {
        it('Should generate and return expected truncation', async function () {
            const terraformHclDependency = new terraformDependencyGraph(
                'tf' satisfies CodeWhispererConstants.PlatformLanguageId
            )
            const truncation = await terraformHclDependency.generateTruncation(vscode.Uri.file(appCodePath))
            assert.ok(truncation.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(truncation.lines > 0)
            assert.ok(truncation.srcPayloadSizeInBytes > 0)
            assert.ok(truncation.scannedFiles.size > 0)
        })
    })
})
