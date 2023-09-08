/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { remove, writeFile } from 'fs-extra'
import { join } from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import { buildSamCliStartApiArguments } from '../../../../shared/sam/cli/samCliStartApi'
import { assertArgIsPresent, assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'

describe('SamCliStartApi', async function () {
    let tempFolder: string
    let placeholderTemplateFile: string
    let placeholderEventFile: string
    const nonRelevantArg = 'arg is not of interest to this test'

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        placeholderTemplateFile = join(tempFolder, 'template.yaml')
        placeholderEventFile = join(tempFolder, 'event.json')
        await writeFile(placeholderTemplateFile, '')
        await writeFile(placeholderEventFile, '')
    })

    afterEach(async function () {
        await remove(tempFolder)
    })

    it('invokes `sam local start-api` with correct args', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            extraArgs: ['--build-dir', 'my/build/dir/'],
        })

        assert.ok(invokeArgs.length >= 2, 'Expected args to be present')
        assert.strictEqual(invokeArgs[0], 'local')
        assert.strictEqual(invokeArgs[1], 'start-api')
        // --debug is present because tests run with "debug" log-level. #1403
        assert.strictEqual(invokeArgs[2], '--debug')
        assert.strictEqual(invokeArgs[3], '--template')
        assert.strictEqual(invokeArgs[5], '--env-vars')

        // `extraArgs` are appended to the end.
        assert.strictEqual(invokeArgs[7], '--build-dir')
        assert.strictEqual(invokeArgs[8], 'my/build/dir/')
    })

    it('Passes template path to sam cli', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
        })

        assertArgsContainArgument(invokeArgs, '--template', placeholderTemplateFile)
    })

    it('Passes env-vars path to sam cli', async function () {
        const expectedEnvVarsPath = 'envvars.json'
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: expectedEnvVarsPath,
        })

        assertArgsContainArgument(invokeArgs, '--env-vars', expectedEnvVarsPath)
    })

    it('Passes debug port to sam cli', async function () {
        const expectedDebugPort = '1234'

        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: expectedDebugPort,
        })

        assertArgsContainArgument(invokeArgs, '--debug-port', expectedDebugPort)
    })

    it('undefined debug port does not pass to sam cli', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            debugPort: undefined,
        })

        assertArgNotPresent(invokeArgs, '--debug-port')
    })

    it('Passes docker network to sam cli', async function () {
        const expectedDockerNetwork = 'hello-world'

        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            dockerNetwork: expectedDockerNetwork,
        })

        assertArgsContainArgument(invokeArgs, '--docker-network', expectedDockerNetwork)
    })

    it('Does not pass docker network to sam cli when undefined', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            dockerNetwork: undefined,
        })

        assertArgNotPresent(invokeArgs, '--docker-network')
    })

    it('passes --skip-pull-image to sam cli if skipPullImage is true', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            skipPullImage: true,
        })

        assertArgIsPresent(invokeArgs, '--skip-pull-image')
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is false', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            skipPullImage: false,
        })

        assertArgNotPresent(invokeArgs, '--skip-pull-image')
    })

    it('does not pass --skip-pull-image to sam cli if skipPullImage is undefined', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            skipPullImage: undefined,
        })

        assertArgNotPresent(invokeArgs, '--skip-pull-image')
    })

    it('Passes debuggerPath to sam cli', async function () {
        const expectedDebuggerPath = join('foo', 'bar')

        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
            debuggerPath: expectedDebuggerPath,
        })

        assertArgsContainArgument(invokeArgs, '--debugger-path', expectedDebuggerPath)
    })

    it('Does not pass debuggerPath to sam cli when undefined', async function () {
        const invokeArgs = await buildSamCliStartApiArguments({
            templatePath: placeholderTemplateFile,
            environmentVariablePath: nonRelevantArg,
        })

        assertArgNotPresent(invokeArgs, '--debugger-path')
    })
})
