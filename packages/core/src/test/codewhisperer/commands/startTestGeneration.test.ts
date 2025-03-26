/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import path, { join } from 'path'
import sinon from 'sinon'
import { CodeWhispererConstants, ZipUtil } from '../../../codewhisperer'
import { tempDirPath } from '../../../shared/filesystemUtilities'
import { fs } from '../../../shared/fs/fs'
import { generateZipTestGen } from '../../../codewhisperer/commands/startTestGeneration'
import { getTestWorkspaceFolder } from '../../../testInteg/integrationTestsUtilities'
import { LspClient } from '../../../amazonq'

describe('generateZipTestGen', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    let zipUtil: ZipUtil
    let getZipDirPathStub: sinon.SinonStub
    let testTempDirPath: string

    beforeEach(function () {
        zipUtil = new ZipUtil(CodeWhispererConstants.TestGenerationTruncDirPrefix)
        testTempDirPath = path.join(tempDirPath, CodeWhispererConstants.TestGenerationTruncDirPrefix)
        getZipDirPathStub = sinon.stub(zipUtil, 'getZipDirPath')
        getZipDirPathStub.callsFake(() => testTempDirPath)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('should generate zip for test generation successfully', async function () {
        const mkdirSpy = sinon.spy(fs, 'mkdir')

        const result = await generateZipTestGen(zipUtil, appRoot, false)

        assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir')))
        assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir', 'buildAndExecuteLogDir')))
        assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir', 'repoMapData')))
        assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir', 'testCoverageDir')))

        assert.strictEqual(result.rootDir, testTempDirPath)
        assert.strictEqual(result.zipFilePath, testTempDirPath + CodeWhispererConstants.codeScanZipExt)
        assert.ok(result.srcPayloadSizeInBytes > 0)
        assert.strictEqual(result.buildPayloadSizeInBytes, 0)
        assert.ok(result.zipFileSizeInBytes > 0)
        assert.strictEqual(result.lines, 150)
        assert.strictEqual(result.language, 'java')
        assert.strictEqual(result.scannedFiles.size, 4)
    })

    it('Should handle file system errors during directory creation', async function () {
        sinon.stub(LspClient, 'instance').get(() => ({
            getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
        }))
        sinon.stub(fs, 'mkdir').rejects(new Error('Directory creation failed'))

        await assert.rejects(() => generateZipTestGen(zipUtil, appRoot, false), /Directory creation failed/)
    })

    it('Should handle zip project errors', async function () {
        sinon.stub(LspClient, 'instance').get(() => ({
            getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
        }))
        sinon.stub(zipUtil, 'zipProject' as keyof ZipUtil).rejects(new Error('Zip failed'))

        await assert.rejects(() => generateZipTestGen(zipUtil, appRoot, false), /Zip failed/)
    })
})
