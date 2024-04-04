/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import { join } from 'path'
import { getTestWorkspaceFolder } from '../../../testInteg/integrationTestsUtilities'
import { ZipUtil } from '../../../codewhisperer/util/zipUtil'
import { SecurityScanType } from '../../../codewhisperer/models/constants'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { ToolkitError } from '../../../shared/errors'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')

    describe('getProjectName', function () {
        it('Should return the correct project name', function () {
            const zipUtil = new ZipUtil()
            assert.strictEqual(zipUtil.getProjectName(vscode.Uri.file(appCodePath)), 'workspaceFolder')
        })
    })

    describe('getProjectPath', function () {
        it('Should return the correct project path', function () {
            const zipUtil = new ZipUtil()
            assert.strictEqual(zipUtil.getProjectPath(vscode.Uri.file(appCodePath)), workspaceFolder)
        })
    })

    describe('generateZip', function () {
        let zipUtil: ZipUtil
        beforeEach(function () {
            zipUtil = new ZipUtil()
        })
        afterEach(function () {
            sinon.restore()
        })

        it('Should generate zip for file scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), SecurityScanType.File)
            assert.strictEqual(zipMetadata.lines, 49)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.strictEqual(zipMetadata.scannedFiles.size, 1)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipStreamBuffer)
            assert.ok(zipMetadata.zipMd5)
        })

        it('Should throw error if payload size limit is reached for file scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), SecurityScanType.File),
                new ToolkitError('Payload size limit reached.')
            )
        })

        it('Should generate zip for project scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), SecurityScanType.Project)
            assert.ok(zipMetadata.lines > 0)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.ok(zipMetadata.scannedFiles.size > 0)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipStreamBuffer)
            assert.ok(zipMetadata.zipMd5)
        })

        it('Should throw error if payload size limit is reached for project scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), SecurityScanType.Project),
                new ToolkitError('Payload size limit reached.')
            )
        })

        it('Should throw error if payload size limit will be reached for project scan', async function () {
            sinon.stub(zipUtil, 'willReachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), SecurityScanType.Project),
                new ToolkitError('Payload size limit reached.')
            )
        })

        it('Should include java .class files', async function () {
            const isClassFileStub = sinon
                .stub(zipUtil, 'isJavaClassFile')
                .onFirstCall()
                .returns(true)
                .onSecondCall()
                .callsFake((...args) => {
                    isClassFileStub.restore()
                    return zipUtil.isJavaClassFile(...args)
                })

            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), SecurityScanType.Project)
            assert.ok(zipMetadata.lines > 0)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.ok(zipMetadata.scannedFiles.size > 0)
            assert.ok(zipMetadata.buildPayloadSizeInBytes > 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipStreamBuffer)
            assert.ok(zipMetadata.zipMd5)
        })

        it('Should throw error if scan type is invalid', async function () {
            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), 'unknown' as SecurityScanType),
                new ToolkitError('Unknown scan type: unknown')
            )
        })
    })
})
