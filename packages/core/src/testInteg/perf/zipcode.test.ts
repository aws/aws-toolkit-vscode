/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { TransformByQState, ZipManifest } from '../../codewhisperer'
import { fs, getRandomString, globals } from '../../shared'
import { createTestWorkspace } from '../../test/testUtil'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { zipCode } from '../../codewhisperer/indexNode'
import { FileSystem } from '../../shared/fs/fs'
import { getFsCallsUpperBound } from './utilities'

interface SetupResult {
    tempDir: string
    tempFileName: string
    transformQManifest: ZipManifest
    fsSpy: sinon.SinonSpiedInstance<FileSystem>
}

async function setup(numberOfFiles: number, fileSize: number): Promise<SetupResult> {
    const transformByQState: TransformByQState = new TransformByQState()
    const tempFileName = `testfile-${globals.clock.Date.now()}.zip`
    const tempDir = (
        await createTestWorkspace(numberOfFiles, {
            fileNamePrefix: 'file',
            fileContent: getRandomString(fileSize),
            fileNameSuffix: '.md',
        })
    ).uri.fsPath
    const fsSpy = sinon.spy(fs)
    const transformQManifest = new ZipManifest()
    transformByQState.setProjectPath(tempDir)
    transformQManifest.customBuildCommand = CodeWhispererConstants.skipUnitTestsBuildCommand
    return { tempDir, tempFileName, transformQManifest, fsSpy }
}

function performanceTestWrapper(numberOfFiles: number, fileSize: number) {
    return performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 200,
            systemCpuUsage: 50,
            heapTotal: 4,
        }),
        'zipCode',
        function () {
            return {
                setup: async () => await setup(numberOfFiles, fileSize),
                execute: async (setup: SetupResult) => {
                    await zipCode({
                        dependenciesFolder: {
                            path: setup.tempDir,
                            name: setup.tempFileName,
                        },
                        humanInTheLoopFlag: false,
                        modulePath: setup.tempDir,
                        zipManifest: setup.transformQManifest,
                    })
                },
                verify: async (setup: SetupResult) => {
                    assert.ok(
                        setup.fsSpy.writeFile.args.find((arg) => {
                            return arg[0].toString().endsWith('.zip')
                        })
                    )

                    assert.ok(getFsCallsUpperBound(setup.fsSpy) <= 15)
                },
            }
        }
    )
}

describe('zipCode', function () {
    describe('performance tests', function () {
        afterEach(function () {
            sinon.restore()
        })
        performanceTestWrapper(250, 10)
        performanceTestWrapper(10, 1000)
    })
})
