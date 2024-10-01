/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { performanceTest } from '../../shared/performance/performance'
import { fs, globals } from '../../shared'
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

describe('zipCode', function () {
    describe('performance tests', function () {
        afterEach(function () {
            sinon.resetHistory()
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
                    setup: async () => {
                        const transformByQState: TransformByQState = new TransformByQState()
                        const tempFileName = `testfile-${globals.clock.Date.now()}.zip`
                        const tempDir = (
                            await createTestWorkspace(250, {
                                fileNamePrefix: 'file',
                                fileContent: '0123456789',
                                fileNameSuffix: '.md',
                            })
                        ).uri.fsPath
                        const transformQManifest = new ZipManifest()
                        transformByQState.setProjectPath(tempDir)
                        transformQManifest.customBuildCommand = CodeWhispererConstants.skipUnitTestsBuildCommand
                        return { tempDir, tempFileName, transformQManifest, writeSpy }
                    },
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
                        // writes a zip to disk.
                        assert.ok(setup.writeSpy.called)
                        assert.ok(
                            setup.writeSpy.getCalls()[0].args[0].includes('.zip') ||
                                setup.writeSpy.getCalls()[1].args[0].includes('.zip')
                        )
                    },
                }
            }
        )
    })
})
