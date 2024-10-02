/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { performanceTest } from '../../shared/performance/performance'
import { fs, getRandomString, globals } from '../../shared'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { TransformByQState, ZipManifest } from '../../codewhisperer'
import { zipCode } from '../../codewhisperer/indexNode'
import { createTestWorkspace } from '../testUtil'

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

describe('zipCode', function () {
    describe('performance tests', function () {
        afterEach(function () {
            sinon.restore()
        })

        performanceTest(
            {
                testRuns: 10,
                linux: {
                    userCpuUsage: 90,
                    systemCpuUsage: 35,
                    heapTotal: 4,
                },
                darwin: {
                    userCpuUsage: 90,
                    systemCpuUsage: 35,
                    heapTotal: 4,
                },
                win32: {
                    userCpuUsage: 90,
                    systemCpuUsage: 35,
                    heapTotal: 4,
                },
            },
            'many small files in zip',
            function () {
                return {
                    setup: async () => await setup(250, 10),
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

        performanceTest(
            {
                testRuns: 10,
                linux: {
                    userCpuUsage: 90,
                    systemCpuUsage: 35,
                    heapTotal: 4,
                },
                darwin: {
                    userCpuUsage: 90,
                    systemCpuUsage: 35,
                    heapTotal: 4,
                },
                win32: {
                    userCpuUsage: 90,
                    systemCpuUsage: 35,
                    heapTotal: 4,
                },
            },
            'few large files',
            function () {
                return {
                    setup: async () => await setup(10, 1000),
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
    })
})
