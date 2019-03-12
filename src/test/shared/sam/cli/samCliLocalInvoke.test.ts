/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import { writeFile } from '../../../../shared/filesystem'
import { mkdtemp } from '../../../../shared/filesystemUtilities'
import { TestLogger } from '../../../../shared/loggerUtils'
import { DefaultSamCliTaskInvoker } from '../../../../shared/sam/cli/samCliInvoker'
import { SamCliLocalInvokeInvocation } from '../../../../shared/sam/cli/samCliLocalInvoke'

describe('SamCliLocalInvokeInvocation', async () => {

    class FakeTaskExecution implements vscode.TaskExecution {
        public constructor(public readonly task: vscode.Task) {
        }

        public terminate(): void {
            throw new Error('Method not implemented.')
        }
    }

    class TestTaskInvoker implements DefaultSamCliTaskInvoker {
        public constructor(
            private readonly onInvoke: (...args: any[]) => void
        ) {
        }

        public async invoke(task: vscode.Task): Promise<vscode.TaskExecution> {
            const shellExecution: vscode.ShellExecution = task.execution as vscode.ShellExecution

            this.onInvoke(shellExecution.args)

            return Promise.resolve(new FakeTaskExecution(task))
        }
    }

    let logger: TestLogger
    let tempFolder: string
    let placeholderTemplateFile: string
    let placeholderEventFile: string
    const nonRelevantArg = 'arg is not of interest to this test'

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    beforeEach(async () => {
        tempFolder = await mkdtemp()
        placeholderTemplateFile = path.join(tempFolder, 'template.yaml')
        placeholderEventFile = path.join(tempFolder, 'event.json')
        await writeFile(placeholderTemplateFile, '')
        await writeFile(placeholderEventFile, '')
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('Passes local invoke command to sam cli', async () => {
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assert.ok(args.length >= 2, 'Expected args to be present')
            assert.strictEqual(args[0], 'local', 'Expected first arg to be local')
            assert.strictEqual(args[1], 'invoke', 'Expected second arg to be invoke')
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker
        }).execute()
    })

    it('Passes template resource name to sam cli', async () => {
        const expectedResourceName = 'HelloWorldResource'
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assertArgIsPresent(args, expectedResourceName)
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: expectedResourceName,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker
        }).execute()
    })

    it('Passes template path to sam cli', async () => {
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--template', placeholderTemplateFile)
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker
        }).execute()
    })

    it('Passes event path to sam cli', async () => {
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--event', placeholderEventFile)
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker
        }).execute()
    })

    it('Passes env-vars path to sam cli', async () => {
        const expectedEnvVarsPath = 'envvars.json'
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assertArgsContainArgument(args, '--env-vars', expectedEnvVarsPath)
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: expectedEnvVarsPath,
            invoker: taskInvoker
        }).execute()
    })

    it('Passes debug port to sam cli', async () => {
        const expectedDebugPort = '1234'
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assertArgsContainArgument(args, '-d', expectedDebugPort)
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: expectedDebugPort,
            invoker: taskInvoker
        }).execute()
    })

    it('undefined debug port does not pass to sam cli', async () => {
        const taskInvoker: DefaultSamCliTaskInvoker = new TestTaskInvoker((args: any[]) => {
            assertArgNotPresent(args, '-d')
        })

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: undefined,
            invoker: taskInvoker
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

    function assertArgIsPresent(
        args: any[],
        argOfInterest: string,
    ) {
        assert.notStrictEqual(
            args.indexOf(argOfInterest),
            -1,
            `Expected ${argOfInterest} arg`
        )
    }

    function assertArgNotPresent(
        args: any[],
        argOfInterest: string,
    ) {
        assert.strictEqual(
            args.indexOf(argOfInterest),
            -1,
            `Did not expect ${argOfInterest} arg`
        )
    }
})
