/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    SamCliLocalInvokeInvocation,
    SamCliLocalInvokeInvocationArguments,
    SamLocalInvokeCommand,
    SamLocalInvokeCommandArgs,
} from '../../../../shared/sam/cli/samCliLocalInvoke'
import * as SamUtilsModule from '../../../../shared/sam/utils'
import { ChildProcess } from '../../../../shared/utilities/processUtils'
import { assertArgIsPresent, assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'
import { fs } from '../../../../shared'
import { SamCliSettings } from '../../../../shared/sam/cli/samCliSettings'
import { isWin } from '../../../../shared/vscode/env'
import sinon from 'sinon'
import { SemVer } from 'semver'

describe('SamCliLocalInvokeInvocation', async function () {
    class TestSamLocalInvokeCommand implements SamLocalInvokeCommand {
        public constructor(private readonly onInvoke: ({ ...params }: SamLocalInvokeCommandArgs) => void) {}

        public async invoke({ ...params }: SamLocalInvokeCommandArgs): Promise<ChildProcess> {
            this.onInvoke(params)
            return {} as ChildProcess // Fake, not used by tests.
        }
    }

    let tempFolder: string
    let placeholderTemplateFile: string
    let placeholderEventFile: string
    const nonRelevantArg = 'arg is not of interest to this test'
    let mockGetSamCliVersion: sinon.SinonStub
    const validRuntime = 'python3.10'
    const invalidRuntime = 'python2.7'
    const validCliVersion = new SemVer('1.135.0')
    const invalidCliVersion = new SemVer('1.134.0')
    let sandbox: sinon.SinonSandbox

    before(async function () {
        // File system search on windows can take a while.
        if (isWin()) {
            this.retries(3)
        }
        // This will place the result in the cache allowing all tests to run under same conditions.
        await SamCliSettings.instance.getOrDetectSamCli()
    })

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        placeholderTemplateFile = path.join(tempFolder, 'template.yaml')
        placeholderEventFile = path.join(tempFolder, 'event.json')
        await fs.writeFile(placeholderTemplateFile, '')
        await fs.writeFile(placeholderEventFile, '')
        sandbox = sinon.createSandbox()
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.delete(tempFolder, { recursive: true })
    })

    function createTaskInvoker(onInvoke: (invokeArgs: SamLocalInvokeCommandArgs) => void): SamLocalInvokeCommand {
        return new TestSamLocalInvokeCommand(onInvoke)
    }

    async function executeInvocation(
        options: Partial<SamCliLocalInvokeInvocationArguments>
    ): Promise<SamLocalInvokeCommandArgs> {
        let invokeArgs: SamLocalInvokeCommandArgs = {} as SamLocalInvokeCommandArgs
        const invocation = new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: createTaskInvoker((args: SamLocalInvokeCommandArgs) => {
                invokeArgs = args
            }),
            ...options,
        })
        await invocation.execute()
        return invokeArgs
    }

    it('invokes `sam local` with args', async function () {
        mockGetSamCliVersion = sandbox
            .stub(SamUtilsModule, 'getSamCliPathAndVersion')
            .callsFake(sandbox.stub().resolves({ parsedVersion: validCliVersion }))

        const taskInvoker: SamLocalInvokeCommand = new TestSamLocalInvokeCommand(
            (invokeArgs: SamLocalInvokeCommandArgs) => {
                assert(mockGetSamCliVersion.calledOnce)
                assert.ok(invokeArgs.args.length >= 2, 'Expected args to be present')
                assert.strictEqual(invokeArgs.args[0], 'local')
                assert.strictEqual(invokeArgs.args[1], 'invoke')
                // --debug is present because tests run with "debug" log-level. #1403
                assert.strictEqual(invokeArgs.args[2], '--debug')
                assert.strictEqual(invokeArgs.args[4], '--template')
                assert.strictEqual(invokeArgs.args[6], '--event')
                assert.strictEqual(invokeArgs.args[8], '--env-vars')
                // `extraArgs` are appended to the end.
                assert.strictEqual(invokeArgs.args[10], '--build-dir')
                assert.strictEqual(invokeArgs.args[11], 'my/build/dir/')

                // 'runtime' is the last argument.
                assert.strictEqual(invokeArgs.args[invokeArgs.args.length - 2], '--runtime')
                assert.strictEqual(invokeArgs.args[invokeArgs.args.length - 1], 'python3.10')
            }
        )

        await new SamCliLocalInvokeInvocation({
            templateResourceName: nonRelevantArg,
            templatePath: placeholderTemplateFile,
            eventPath: placeholderEventFile,
            environmentVariablePath: nonRelevantArg,
            invoker: taskInvoker,
            extraArgs: ['--build-dir', 'my/build/dir/'],
            runtime: validRuntime,
        }).execute()
    })

    it('Passes template resource name to sam cli', async function () {
        const expectedResourceName = 'HelloWorldResource'
        const invokeArgs = await executeInvocation({ templateResourceName: expectedResourceName })
        assertArgIsPresent(invokeArgs.args, expectedResourceName)
    })

    it('Passes template path to sam cli', async function () {
        const invokeArgs = await executeInvocation({})
        assertArgsContainArgument(invokeArgs.args, '--template', placeholderTemplateFile)
    })

    it('Passes event path to sam cli', async function () {
        const invokeArgs = await executeInvocation({})
        assertArgsContainArgument(invokeArgs.args, '--event', placeholderEventFile)
    })

    it('Passes env-vars path to sam cli', async function () {
        const expectedEnvVarsPath = 'envvars.json'
        const invokeArgs = await executeInvocation({ environmentVariablePath: expectedEnvVarsPath })
        assertArgsContainArgument(invokeArgs.args, '--env-vars', expectedEnvVarsPath)
    })

    it('Passes debug port to sam cli', async function () {
        const expectedDebugPort = '1234'
        const invokeArgs = await executeInvocation({ debugPort: expectedDebugPort })
        assertArgsContainArgument(invokeArgs.args, '-d', expectedDebugPort)
    })

    it('undefined debug port does not pass to sam cli', async function () {
        const invokeArgs = await executeInvocation({ debugPort: undefined })
        assertArgNotPresent(invokeArgs.args, '-d')
    })

    it('Passes docker network to sam cli', async function () {
        const expectedDockerNetwork = 'hello-world'
        const invokeArgs = await executeInvocation({ dockerNetwork: expectedDockerNetwork })
        assertArgsContainArgument(invokeArgs.args, '--docker-network', expectedDockerNetwork)
    })

    it('Does not pass docker network to sam cli when undefined', async function () {
        const invokeArgs = await executeInvocation({ dockerNetwork: undefined })
        assertArgNotPresent(invokeArgs.args, '--docker-network')
    })

    it('passes --skip-pull-image to sam cli if skipPullImage is true', async function () {
        const invokeArgs = await executeInvocation({ skipPullImage: true })
        assertArgIsPresent(invokeArgs.args, '--skip-pull-image')
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is false', async function () {
        const invokeArgs = await executeInvocation({ skipPullImage: false })
        assertArgNotPresent(invokeArgs.args, '--skip-pull-image')
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is undefined', async function () {
        const invokeArgs = await executeInvocation({ skipPullImage: undefined })
        assertArgNotPresent(invokeArgs.args, '--skip-pull-image')
    })

    it('Passes debuggerPath to sam cli', async function () {
        const expectedDebuggerPath = path.join('foo', 'bar')
        const invokeArgs = await executeInvocation({ debuggerPath: expectedDebuggerPath })
        assertArgsContainArgument(invokeArgs.args, '--debugger-path', expectedDebuggerPath)
    })

    it('Does not pass debuggerPath to sam cli when undefined', async function () {
        const invokeArgs = await executeInvocation({})
        assertArgNotPresent(invokeArgs.args, '--debugger-path')
    })

    it('Passes runtime to sam cli', async function () {
        mockGetSamCliVersion = sandbox
            .stub(SamUtilsModule, 'getSamCliPathAndVersion')
            .callsFake(sandbox.stub().resolves({ parsedVersion: new SemVer('1.135.0') }))

        const invokeArgs = await executeInvocation({ runtime: validRuntime })
        assertArgsContainArgument(invokeArgs.args, '--runtime', validRuntime)
    })

    it('Does not pass runtime to sam cli when version < 1.135.0', async function () {
        mockGetSamCliVersion = sandbox
            .stub(SamUtilsModule, 'getSamCliPathAndVersion')
            .callsFake(sandbox.stub().resolves({ parsedVersion: invalidCliVersion }))

        const invokeArgs = await executeInvocation({ runtime: validRuntime })
        assertArgNotPresent(invokeArgs.args, '--runtime')
    })

    it('Does not pass runtime to sam cli when runtime is deprecated', async function () {
        mockGetSamCliVersion = sandbox
            .stub(SamUtilsModule, 'getSamCliPathAndVersion')
            .callsFake(sandbox.stub().resolves({ parsedVersion: validCliVersion }))

        const invokeArgs = await executeInvocation({ runtime: invalidRuntime })
        assertArgNotPresent(invokeArgs.args, '--runtime')
    })
})
