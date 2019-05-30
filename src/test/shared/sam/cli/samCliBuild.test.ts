/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SpawnOptions } from 'child_process'
import * as del from 'del'
import * as path from 'path'
import { writeFile } from '../../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { TestLogger } from '../../../../shared/loggerUtils'
import { FileFunctions, SamCliBuildInvocation } from '../../../../shared/sam/cli/samCliBuild'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { assertThrowsError } from '../../utilities/assertUtils'
import { assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'
import {
    assertErrorContainsBadExitMessage,
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
    TestSamCliProcessInvoker
} from './testSamCliProcessInvoker'

describe('SamCliBuildInvocation', async () => {

    class FakeChildProcessResult implements ChildProcessResult {
        public exitCode: number = 0
        public error = undefined
        public stdout: string = ''
        public stderr: string = ''
    }

    // Returns FakeChildProcessResult for each invoke
    class ExtendedTestSamCliProcessInvoker extends TestSamCliProcessInvoker {

        public constructor(
            onInvoke: (...args: any[]) => void
        ) {
            super((spawnOptions: SpawnOptions, ...args: any[]) => {
                onInvoke(...args)

                return new FakeChildProcessResult()
            })
        }
    }

    let logger: TestLogger
    let tempFolder: string
    let placeholderTemplateFile: string
    const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})
    const nonRelevantArg = 'arg is not of interest to this test'
    const fakeFileFunctions: FileFunctions = {
        fileExists: async (filePath: string): Promise<boolean> => true
    }

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        placeholderTemplateFile = path.join(tempFolder, 'template.yaml')
        await writeFile(placeholderTemplateFile, '')
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('Passes build command to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assert.ok(args.length > 0, 'Expected args to be present')
            assert.strictEqual(args[0], 'build', 'Expected first arg to be the build command')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            baseDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Passes Build Dir to sam cli', async () => {
        const expectedBuildDir = '/build'

        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--build-dir', expectedBuildDir)
        })

        await new SamCliBuildInvocation({
            buildDir: expectedBuildDir,
            baseDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Passes Base Dir to sam cli', async () => {
        const expectedBaseDir = '/src'

        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--base-dir', expectedBaseDir)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            baseDir: expectedBaseDir,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Does not pass Base Dir to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--base-dir')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Passes Template to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--template', placeholderTemplateFile)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            baseDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('passes --use-container to sam cli if useContainer is true', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assert.notStrictEqual(
                args.indexOf('--use-container'),
                -1,
                'Expected --use-container arg'
            )
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            useContainer: true,
        }).execute()
    })

    it('does not pass --use-container to sam cli if useContainer is false', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--use-container')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            useContainer: false,
        }).execute()
    })

    it('does not pass --use-container to sam cli if useContainer is undefined', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--use-container')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('passes --manifest to sam cli if manifestPath is set', async () => {
        const expectedArg = 'mypath'

        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--manifest', expectedArg)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            manifestPath: expectedArg,
        }).execute()
    })

    it('does not pass --manifest to sam cli if manifestPath is not set', async () => {

        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--manifest')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker
        }).execute()
    })

    it('Passes docker network to sam cli', async () => {
        const expectedDockerNetwork = 'hello-world'

        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--docker-network', expectedDockerNetwork)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            dockerNetwork: expectedDockerNetwork
        }).execute()
    })

    it('Does not pass docker network to sam cli if undefined', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--docker-network')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('passes --skip-pull-image to sam cli if skipPullImage is true', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assert.notStrictEqual(
                args.indexOf('--skip-pull-image'),
                -1,
                'Expected --skip-pull-image arg'
            )
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            skipPullImage: true,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImageis false', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--skip-pull-image')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            skipPullImage: false,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is undefined', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--skip-pull-image')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('throws on unexpected exit code', async () => {
        const error = await assertThrowsError(
            async () => {
                await new SamCliBuildInvocation(
                    {
                        buildDir: nonRelevantArg,
                        templatePath: placeholderTemplateFile,
                        invoker: badExitCodeProcessInvoker,
                    },
                    {
                        file: fakeFileFunctions
                    },
                ).execute()
            },
            'Expected an error to be thrown'
        )

        assertErrorContainsBadExitMessage(error, badExitCodeProcessInvoker.error.message)
        await assertLogContainsBadExitInformation(logger, badExitCodeProcessInvoker.makeChildProcessResult(), 0)
    })
})
