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
import { mkdtemp } from '../../../../shared/filesystemUtilities'
import { TestLogger } from '../../../../shared/loggerUtils'
import { SamCliBuildInvocation } from '../../../../shared/sam/cli/samCliBuild'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvoker'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'

describe('SamCliBuildInvocation', async () => {

    class FakeChildProcessResult implements ChildProcessResult {
        public exitCode: number = 0
        public error = undefined
        public stdout: string = ''
        public stderr: string = ''
    }

    class TextProcessInvoker implements SamCliProcessInvoker {

        public constructor(
            private readonly onInvoke: (...args: any[]) => void
        ) {
        }

        public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
        public invoke(...args: string[]): Promise<ChildProcessResult>
        public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
            const args = typeof first === 'string' ? [first, ...rest] : rest

            this.onInvoke(args)

            return Promise.resolve<ChildProcessResult>(new FakeChildProcessResult())
        }
    }

    let logger: TestLogger
    let tempFolder: string
    let placeholderTemplateFile: string

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    beforeEach(async () => {
        tempFolder = await mkdtemp()
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
        const nonRelevantArg = 'arg is not of interest to this test'

        const processInvoker: SamCliProcessInvoker = new TextProcessInvoker((args: any[]) => {
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
        const nonRelevantArg = 'arg is not of interest to this test'

        const processInvoker: SamCliProcessInvoker = new TextProcessInvoker((args: any[]) => {
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
        const nonRelevantArg = 'arg is not of interest to this test'

        const processInvoker: SamCliProcessInvoker = new TextProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--base-dir', expectedBaseDir)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            baseDir: expectedBaseDir,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    it('Passes Template to sam cli', async () => {
        const nonRelevantArg = 'arg is not of interest to this test'

        const processInvoker: SamCliProcessInvoker = new TextProcessInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--template', placeholderTemplateFile)
        })

        await new SamCliBuildInvocation({
            buildDir: nonRelevantArg,
            baseDir: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            invoker: processInvoker,
        }).execute()
    })

    function assertArgsContainArgument(
        args: any[],
        argOfInterest: string,
        expectedArgValue: string
    ) {
        const argPos = args.indexOf(argOfInterest)
        assert.notStrictEqual(argPos, -1, `Expected arg ${argOfInterest} was not found`)
        assert.ok(args.length >= argPos + 2, `Args does not contain a value for ${argOfInterest}`)
        assert.strictEqual(args[argPos + 1], expectedArgValue, `Arg ${argOfInterest} did not have expected value`)
    }
})
