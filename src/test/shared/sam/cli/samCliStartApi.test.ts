/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import { writeFile } from 'fs-extra'
import { join } from 'path'
import { SamLocalInvokeCommand, SamLocalInvokeCommandArgs } from '../../../../shared/sam/cli/samCliLocalInvoke'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { SamCliStartApiInvocation } from '../../../../shared/sam/cli/samCliStartApi'
import { assertArgIsPresent, assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'

describe('SamCliStartApi', async () => {
    class TestSamStartApiCommand implements SamLocalInvokeCommand {
        public constructor(private readonly onInvoke: ({ ...params }: SamLocalInvokeCommandArgs) => void) {}

        public async invoke({ ...params }: SamLocalInvokeCommandArgs): Promise<void> {
            this.onInvoke(params)
        }
    }

    let tempFolder: string
    let placeholderTemplateFile: string
    let placeholderEventFile: string
    const nonRelevantArg = 'arg is not of interest to this test'

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        placeholderTemplateFile = join(tempFolder, 'template.yaml')
        placeholderEventFile = join(tempFolder, 'event.json')
        await writeFile(placeholderTemplateFile, '')
        await writeFile(placeholderEventFile, '')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('invokes `sam local start-api` with correct args', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamStartApiCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assert.ok(invokeArgs.args.length >= 2, 'Expected args to be present')
                assert.strictEqual(invokeArgs.args[0], 'local')
                assert.strictEqual(invokeArgs.args[1], 'start-api')
                assert.strictEqual(invokeArgs.args[2], '--template')
                assert.strictEqual(invokeArgs.args[4], '--env-vars')

                // `extraArgs` are appended to the end.
                assert.strictEqual(invokeArgs.args[6], '--debug')
                assert.strictEqual(invokeArgs.args[7], '--build-dir')
                assert.strictEqual(invokeArgs.args[8], 'my/build/dir/')
            }
        )

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            extraArgs: ['--debug', '--build-dir', 'my/build/dir/'],
        }).execute()
    })

    it('Passes template path to sam cli', async () => {
        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgsContainArgument(invokeArgs.args, '--template', placeholderTemplateFile)
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes env-vars path to sam cli', async () => {
        const expectedEnvVarsPath = 'envvars.json'
        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgsContainArgument(invokeArgs.args, '--env-vars', expectedEnvVarsPath)
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: expectedEnvVarsPath,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes debug port to sam cli', async () => {
        const expectedDebugPort = '1234'
        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgsContainArgument(invokeArgs.args, '--debug-port', expectedDebugPort)
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: expectedDebugPort,
            invoker: taskInvoker,
        }).execute()
    })

    it('undefined debug port does not pass to sam cli', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamStartApiCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--debug-port')
            }
        )

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: undefined,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes docker network to sam cli', async () => {
        const expectedDockerNetwork = 'hello-world'
        const taskInvoker: SamLocalInvokeCommand = new TestSamStartApiCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '--docker-network', expectedDockerNetwork)
            }
        )

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            dockerNetwork: expectedDockerNetwork,
        }).execute()
    })

    it('Does not pass docker network to sam cli when undefined', async () => {
        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgNotPresent(invokeArgs.args, '--docker-network')
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            dockerNetwork: undefined,
        }).execute()
    })

    it('passes --skip-pull-image to sam cli if skipPullImage is true', async () => {
        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgIsPresent(invokeArgs.args, '--skip-pull-image')
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            skipPullImage: true,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is false', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamStartApiCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--skip-pull-image')
            }
        )

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            skipPullImage: false,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is undefined', async () => {
        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgNotPresent(invokeArgs.args, '--skip-pull-image')
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            skipPullImage: undefined,
        }).execute()
    })

    it('Passes debuggerPath to sam cli', async () => {
        const expectedDebuggerPath = join('foo', 'bar')

        const taskInvoker = new TestSamStartApiCommand((invokeArgs: SamLocalInvokeCommandArgs) => {
            assertArgsContainArgument(invokeArgs.args, '--debugger-path', expectedDebuggerPath)
        })

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            debuggerPath: expectedDebuggerPath,
        }).execute()
    })

    it('Does not pass debuggerPath to sam cli when undefined', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamStartApiCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--debugger-path')
            }
        )

        await new SamCliStartApiInvocation({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })
})
