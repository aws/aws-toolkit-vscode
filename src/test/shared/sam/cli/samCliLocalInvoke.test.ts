/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import { writeFile } from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    SamCliLocalInvokeInvocation,
    SamLocalInvokeCommand,
    SamLocalInvokeCommandArgs,
} from '../../../../shared/sam/cli/samCliLocalInvoke'
import { assertArgIsPresent, assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'

describe('SamCliLocalInvokeInvocation', async () => {
    class TestSamLocalInvokeCommand implements SamLocalInvokeCommand {
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
        placeholderTemplateFile = path.join(tempFolder, 'template.yaml')
        placeholderEventFile = path.join(tempFolder, 'event.json')
        await writeFile(placeholderTemplateFile, '')
        await writeFile(placeholderEventFile, '')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('Passes local invoke command to sam cli', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assert.ok(invokeArgs.args.length >= 2, 'Expected args to be present')
                assert.strictEqual(invokeArgs.args[0], 'local', 'Expected first arg to be local')
                assert.strictEqual(invokeArgs.args[1], 'invoke', 'Expected second arg to be invoke')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes template resource name to sam cli', async () => {
        const expectedResourceName = 'HelloWorldResource'
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgIsPresent(invokeArgs.args, expectedResourceName)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: expectedResourceName,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes template path to sam cli', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '--template', placeholderTemplateFile)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes event path to sam cli', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '--event', placeholderEventFile)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes env-vars path to sam cli', async () => {
        const expectedEnvVarsPath = 'envvars.json'
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '--env-vars', expectedEnvVarsPath)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: expectedEnvVarsPath,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes debug port to sam cli', async () => {
        const expectedDebugPort = '1234'
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '-d', expectedDebugPort)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: expectedDebugPort,
            invoker: taskInvoker,
        }).execute()
    })

    it('undefined debug port does not pass to sam cli', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '-d')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: undefined,
            invoker: taskInvoker,
        }).execute()
    })

    it('Passes docker network to sam cli', async () => {
        const expectedDockerNetwork = 'hello-world'
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '--docker-network', expectedDockerNetwork)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            dockerNetwork: expectedDockerNetwork,
        }).execute()
    })

    it('Does not pass docker network to sam cli when undefined', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--docker-network')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            dockerNetwork: undefined,
        }).execute()
    })

    it('passes --skip-pull-image to sam cli if skipPullImage is true', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgIsPresent(invokeArgs.args, '--skip-pull-image')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            skipPullImage: true,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is false', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--skip-pull-image')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            skipPullImage: false,
        }).execute()
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is undefined', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--skip-pull-image')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            skipPullImage: undefined,
        }).execute()
    })

    it('Passes debuggerPath to sam cli', async () => {
        const expectedDebuggerPath = path.join('foo', 'bar')

        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgsContainArgument(invokeArgs.args, '--debugger-path', expectedDebuggerPath)
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            debuggerPath: expectedDebuggerPath,
        }).execute()
    })

    it('Does not pass debuggerPath to sam cli when undefined', async () => {
        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assertArgNotPresent(invokeArgs.args, '--debugger-path')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
        }).execute()
    })
})
