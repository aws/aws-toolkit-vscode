/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import { join, relative } from 'path'
import { getTestWorkspaceFolder } from '../../../testInteg/integrationTestsUtilities'
import { ZipUtil } from '../../../codewhisperer/util/zipUtil'
import { SecurityScanType } from '../../../codewhisperer/models/constants'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { ToolkitError } from '../../../shared/errors'
import fs from 'fs'
import { fsCommon } from '../../../srcShared/fs'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction/src/main/java/helloworld/App.java')

    describe('getProjectName', function () {
        it('Should return the correct project name', function () {
            const zipUtil = new ZipUtil()
            assert.strictEqual(zipUtil.getProjectName(vscode.Uri.parse(appCodePath)), 'workspaceFolder')
        })
    })

    describe('getProjectPath', function () {
        it('Should return the correct project path', function () {
            const zipUtil = new ZipUtil()
            assert.strictEqual(zipUtil.getProjectPath(vscode.Uri.parse(appCodePath)), workspaceFolder)
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
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.File)
            assert.strictEqual(zipMetadata.lines, 49)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.strictEqual(zipMetadata.srcPayloadSizeInBytes, 1864)
            assert.strictEqual(zipMetadata.scannedFiles.size, 1)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.strictEqual(zipMetadata.zipFileSizeInBytes, 969)
            assert.ok(zipMetadata.scannedFiles.has(relative(workspaceFolder, appCodePath)))
            assert.ok(zipMetadata.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for file scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.File),
                new ToolkitError('Payload size limit reached.')
            )
        })

        it('Should generate zip for project scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.Project)
            assert.strictEqual(zipMetadata.lines, 2705)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.strictEqual(zipMetadata.srcPayloadSizeInBytes, 89378)
            assert.strictEqual(zipMetadata.scannedFiles.size, 89)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.strictEqual(zipMetadata.zipFileSizeInBytes, 53651)
            assert.ok(zipMetadata.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for project scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.Project),
                new ToolkitError('Payload size limit reached.')
            )
        })

        it('Should throw error if payload size limit will be reached for project scan', async function () {
            sinon.stub(zipUtil, 'willReachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.Project),
                new ToolkitError('Payload size limit reached.')
            )
        })

        it('Should not include files ignored by .gitignore', async function () {
            const existsStub = sinon
                .stub(fs, 'existsSync')
                .onFirstCall()
                .returns(true)
                .onSecondCall()
                .callsFake((...args) => {
                    existsStub.restore()
                    return fs.existsSync(...args)
                })
            const readFileStub = sinon
                .stub(fsCommon, 'readFileAsString')
                .onFirstCall()
                .returns(Promise.resolve(relative(workspaceFolder, appCodePath)))
                .onSecondCall()
                .callsFake((...args) => {
                    readFileStub.restore()
                    return fsCommon.readFileAsString(...args)
                })

            const zipMetadata = await zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.Project)
            assert.strictEqual(zipMetadata.lines, 2656)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.strictEqual(zipMetadata.srcPayloadSizeInBytes, 87514)
            assert.strictEqual(zipMetadata.scannedFiles.size, 88)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.strictEqual(zipMetadata.zipFileSizeInBytes, 52704)
            assert.ok(zipMetadata.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
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

            const zipMetadata = await zipUtil.generateZip(vscode.Uri.parse(appCodePath), SecurityScanType.Project)
            assert.strictEqual(zipMetadata.lines, 2698)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.strictEqual(zipMetadata.srcPayloadSizeInBytes, 89277)
            assert.strictEqual(zipMetadata.scannedFiles.size, 88)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 101)
            assert.strictEqual(zipMetadata.zipFileSizeInBytes, 53651)
            assert.ok(zipMetadata.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
        })

        it('Should throw error if scan type is invalid', async function () {
            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.parse(appCodePath), 'unknown' as SecurityScanType),
                new ToolkitError('Unknown scan type: unknown')
            )
        })
    })
})
