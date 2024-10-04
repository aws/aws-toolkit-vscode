/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import { Content } from 'aws-sdk/clients/codecommit'
import AdmZip from 'adm-zip'
import path from 'path'
import { LspController } from '../amazonq'
import { fs, getRandomString, globals } from '../shared'
import { createTestWorkspace } from '../test/testUtil'
import { performanceTest } from '../shared/performance/performance'

// fakeFileContent is matched to fakeQServerContent based on hash.
const fakeHash = '4eb2865c8f40a322aa04e17d8d83bdaa605d6f1cb363af615240a5442a010e0aef66e21bcf4c88f20fabff06efe8a214'

const fakeQServerContent = {
    filename: 'qserver-fake.zip',
    url: 'https://aws-language-servers/fake.zip',
    hashes: [`sha384:${fakeHash}`],
    bytes: 93610849,
    serverVersion: '1.1.1',
}

const fakeNodeContent = {
    filename: 'fake-file',
    url: 'https://aws-language-servers.fake-file',
    hashes: [`sha384:${fakeHash}`],
    bytes: 94144448,
    serverVersion: '1.1.1',
}

function createStubs(numberOfFiles: number, fileSize: number) {
    // Avoid making HTTP request or mocking giant manifest, stub what we need directly from request.
    sinon.stub(LspController.prototype, 'fetchManifest')
    // Directly feed the runtime specifications.
    sinon.stub(LspController.prototype, 'getQserverFromManifest').returns(fakeQServerContent)
    sinon.stub(LspController.prototype, 'getNodeRuntimeFromManifest').returns(fakeNodeContent)
    // avoid fetch call.
    sinon.stub(LspController.prototype, '_download').callsFake(getFakeDownload(numberOfFiles, fileSize))
    // Hard code the hash since we are creating files on the spot, whose hashes can't be predicted.
    sinon.stub(LspController.prototype, 'getFileSha384').resolves(fakeHash)
    // Don't allow tryInstallLsp to move runtimes out of temporary folder.
    sinon.stub(fs, 'rename')
}

/**
 * Creates a fake zip with some files in it.
 * @param filepath where to write the zip to.
 * @param _content unused parameter, for compatability with real function.
 */
const getFakeDownload = function (numberOfFiles: number, fileSize: number) {
    return async function (filepath: string, _content: Content) {
        const dummyFilesPath = (
            await createTestWorkspace(numberOfFiles, {
                fileNamePrefix: 'fakeFile',
                fileContent: getRandomString(fileSize),
                workspaceName: 'workspace',
            })
        ).uri.fsPath
        await fs.writeFile(path.join(dummyFilesPath, 'qserver'), 'this value shouldnt matter')
        const zip = new AdmZip()
        zip.addLocalFolder(dummyFilesPath)
        zip.writeZip(filepath)
    }
}

function performanceTestWrapper(numFiles: number, fileSize: number) {
    return performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 100,
                systemCpuUsage: 35,
                heapTotal: 6,
                duration: 15,
            },
            darwin: {
                userCpuUsage: 100,
                systemCpuUsage: 35,
                heapTotal: 6,
                duration: 15,
            },
            win32: {
                userCpuUsage: 100,
                systemCpuUsage: 35,
                heapTotal: 6,
                duration: 15,
            },
        },
        'many small files in zip',
        function () {
            return {
                setup: async () => {
                    createStubs(numFiles, fileSize)
                },
                execute: async () => {
                    return await LspController.instance.tryInstallLsp(globals.context)
                },
                verify: async (_setup: any, result: boolean) => {
                    assert.ok(result)
                },
            }
        }
    )
}

describe('tryInstallLsp', function () {
    afterEach(function () {
        sinon.restore()
    })
    describe('performance tests', function () {
        performanceTestWrapper(250, 10)
        performanceTestWrapper(10, 1000)
    })
})
