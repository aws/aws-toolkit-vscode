/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SpawnOptions } from 'child_process'
import { writeFile, remove } from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { makeUnexpectedExitCodeError } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { FileFunctions, SamCliBuildInvocation } from '../../../../shared/sam/cli/samCliBuild'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { getTestLogger } from '../../../globalSetup.test'
import { assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'
import {
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
    TestSamCliProcessInvoker,
} from './testSamCliProcessInvoker'

describe('SamCliBuildInvocation', async function () {
    class FakeChildProcessResult implements ChildProcessResult {
        public exitCode: number = 0
        public error = undefined
        public stdout: string = ''
        public stderr: string = ''
    }

    // Returns FakeChildProcessResult for each invoke
    class ExtendedTestSamCliProcessInvoker extends TestSamCliProcessInvoker {
        public constructor(onInvoke: (...args: any[]) => void) {
            super((spawnOptions: SpawnOptions, ...args: any[]) => {
                onInvoke(...args)

                return new FakeChildProcessResult()
            })
        }
    }

    let tempFolder: string
    let placeholderTemplateFile: string
    const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})
    const nonRelevantArg = 'arg is not of interest to this test'
    const fakeFileFunctions: FileFunctions = {
        fileExists: async (filePath: string): Promise<boolean> => true,
    }

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        placeholderTemplateFile = path.join(tempFolder, 'template.yaml')
        await writeFile(placeholderTemplateFile, '')
    })

    afterEach(async function () {
        await remove(tempFolder)
    })

    it('invokes `sam build` with args', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assert.ok(args.length >= 2, 'Expected args to be present')
            assert.strictEqual(args[0], 'build')
            // --debug is present because tests run with "debug" log-level. #1403
            assert.strictEqual(args[1], '--debug')
            assert.strictEqual(args[4], '--template')
            assert.strictEqual(args[6], '--base-dir')

            // `extraArgs` are appended to the end.
            assert.strictEqual(args[8], '--parameter-overrides')
            assert.strictEqual(args[9], 'math=math')
            assert.strictEqual(args[10], '--build-dir')
            assert.strictEqual(args[11], 'my/build/dir/')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            baseDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            extraArgs: ['--build-dir', 'my/build/dir/'],
            parameterOverrides: ['math=math'],
        }).execute()
    })

    it('Passes Build Dir to sam cli', async function () {
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

    it('Passes Base Dir to sam cli', async function () {
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

    it('Does not pass Base Dir to sam cli', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--base-dir')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Passes Template to sam cli', async function () {
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

    it('passes --use-container to sam cli if useContainer is true', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assert.notStrictEqual(args.indexOf('--use-container'), -1, 'Expected --use-container arg')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            useContainer: true,
        }).execute()
    })

    it('does not pass --use-container to sam cli if useContainer is false', async function () {
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

    it('does not pass --use-container to sam cli if useContainer is undefined', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--use-container')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('passes --manifest to sam cli if manifestPath is set', async function () {
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

    it('does not pass --manifest to sam cli if manifestPath is not set', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--manifest')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Passes docker network to sam cli', async function () {
        const expectedDockerNetwork = 'hello-world'

        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--docker-network', expectedDockerNetwork)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            dockerNetwork: expectedDockerNetwork,
        }).execute()
    })

    it('Does not pass docker network to sam cli if undefined', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--docker-network')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('passes --skip-pull-image to sam cli if skipPullImage is true', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assert.notStrictEqual(args.indexOf('--skip-pull-image'), -1, 'Expected --skip-pull-image arg')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
            skipPullImage: true,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImageis false', async function () {
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

    it('does not pass --skip-pull-image to sam cli if skipPullImage is undefined', async function () {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker((args: any[]) => {
            assertArgNotPresent(args, '--skip-pull-image')
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('throws on unexpected exit code', async function () {
        const builder = new SamCliBuildInvocation(
            {
                buildDir: nonRelevantArg,
                templatePath: placeholderTemplateFile,
                invoker: badExitCodeProcessInvoker,
            },
            {
                file: fakeFileFunctions,
            }
        )

        const expectedError = makeUnexpectedExitCodeError(badExitCodeProcessInvoker.error.message)
        await assert.rejects(builder.execute(), expectedError, 'Expected error was not thrown')

        await assertLogContainsBadExitInformation(
            getTestLogger(),
            badExitCodeProcessInvoker.makeChildProcessResult(),
            0
        )
    })
})
