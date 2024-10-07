/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { TransformByQState, ZipManifest } from '../codewhisperer'
import { fs, getRandomString, globals } from '../shared'
import { createTestWorkspace } from '../test/testUtil'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { performanceTest } from '../shared/performance/performance'
import { zipCode } from '../codewhisperer/indexNode'

interface SetupResult {
    tempDir: string
    tempFileName: string
    transformQManifest: ZipManifest
    writeSpy: sinon.SinonSpy
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
    const writeSpy = sinon.spy(fs, 'writeFile')
    const transformQManifest = new ZipManifest()
    transformByQState.setProjectPath(tempDir)
    transformQManifest.customBuildCommand = CodeWhispererConstants.skipUnitTestsBuildCommand
    return { tempDir, tempFileName, transformQManifest, writeSpy }
}

function performanceTestWrapper(numberOfFiles: number, fileSize: number) {
    return performanceTest(
        {
            testRuns: 10,
            linux: {
                userCpuUsage: 120,
                systemCpuUsage: 50,
                heapTotal: 4,
            },
            darwin: {
                userCpuUsage: 120,
                systemCpuUsage: 50,
                heapTotal: 4,
            },
            win32: {
                userCpuUsage: 120,
                systemCpuUsage: 50,
                heapTotal: 4,
            },
        },
        'zipCode',
        function () {
            return {
                setup: async () => await setup(numberOfFiles, fileSize),
                execute: async ({ tempDir, tempFileName, transformQManifest, writeSpy }: SetupResult) => {
                    await zipCode({
                        dependenciesFolder: {
                            path: tempDir,
                            name: tempFileName,
                        },
                        humanInTheLoopFlag: false,
                        modulePath: tempDir,
                        zipManifest: transformQManifest,
                    })
                },
                verify: async (setup: SetupResult) => {
                    assert.ok(
                        setup.writeSpy.args.find((arg) => {
                            return arg[0].endsWith('.zip')
                        })
                    )
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
