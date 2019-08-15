/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SpawnOptions } from 'child_process'

import { access } from '../../../../shared/filesystem'
import { readFileAsString } from '../../../../shared/filesystemUtilities'
import { TestLogger } from '../../../../shared/loggerUtils'
import {
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker
} from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'

export class TestSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(private readonly onInvoke: (spawnOptions: SpawnOptions, ...args: any[]) => ChildProcessResult) {}

    public async invoke(options?: SamCliProcessInvokeOptions): Promise<ChildProcessResult> {
        const invokeOptions = makeRequiredSamCliProcessInvokeOptions(options)

        return this.onInvoke(invokeOptions.spawnOptions, invokeOptions.arguments)
    }
}

export class BadExitCodeSamCliProcessInvoker extends TestSamCliProcessInvoker {
    public exitCode: number
    public error: Error
    public stdout: string
    public stderr: string

    public constructor({
        exitCode = -1,
        error = new Error('Bad Result'),
        stdout = 'stdout message',
        stderr = 'stderr message'
    }: {
        exitCode?: number
        error?: Error
        stdout?: string
        stderr?: string
    }) {
        super((spawnOptions: SpawnOptions, ...args: any[]) => {
            return this.makeChildProcessResult()
        })

        this.exitCode = exitCode
        this.error = error
        this.stdout = stdout
        this.stderr = stderr
    }

    public makeChildProcessResult(): ChildProcessResult {
        const result: ChildProcessResult = {
            exitCode: this.exitCode,
            error: this.error,
            stdout: this.stdout,
            stderr: this.stderr
        }

        return result
    }
}

export class FakeChildProcessResult implements ChildProcessResult {
    public exitCode: number
    public error: Error | undefined
    public stdout: string
    public stderr: string

    public constructor({ exitCode = 0, stdout = '', stderr = '', ...params }: Partial<ChildProcessResult>) {
        this.exitCode = exitCode
        this.error = params.error
        this.stdout = stdout
        this.stderr = stderr
    }
}

export function assertErrorContainsBadExitMessage(actualError: Error, sourceErrorMessage: string) {
    assert.strictEqual(
        actualError.message,
        `Error with child process: ${sourceErrorMessage}`,
        'Unexpected error message'
    )
}

export async function assertLogContainsBadExitInformation(
    logger: TestLogger,
    errantChildProcessResult: ChildProcessResult,
    expectedExitCode: number
): Promise<void> {
    const logPath = logger.logPath
    const expectedTexts = [
        {
            text: `Unexpected exitcode (${errantChildProcessResult.exitCode}), expecting (${expectedExitCode})`,
            verifyMessage: 'Log message missing for exit code'
        },
        { text: `Error: ${errantChildProcessResult.error}`, verifyMessage: 'Log message missing for error' },
        { text: `stderr: ${errantChildProcessResult.stderr}`, verifyMessage: 'Log message missing for stderr' },
        { text: `stdout: ${errantChildProcessResult.stdout}`, verifyMessage: 'Log message missing for stdout' }
    ]

    // Give the log a chance to get created/flushed
    await retryOnError({
        description: 'Wait for log file to exist',
        fn: async () => await access(logPath),
        retries: 20,
        delayMilliseconds: 50,
        failureMessage: `Could not find log file: ${logPath}`
    })

    await retryOnError({
        description: 'Wait for expected text to appear in log',
        fn: async () => {
            const logText = await readFileAsString(logPath)
            const verifyMessage = verifyLogText(logText, expectedTexts)
            if (verifyMessage) {
                console.log(verifyMessage)
                throw new Error(verifyMessage)
            }
        },
        retries: 20,
        delayMilliseconds: 50,
        failureMessage: 'Did not find expected log contents'
    })
}

function verifyLogText(text: string, expectedTexts: { text: string; verifyMessage: string }[]): string | undefined {
    for (const entry of expectedTexts) {
        if (!text.includes(entry.text)) {
            return entry.verifyMessage
        }
    }

    return undefined
}

async function retryOnError(parameters: {
    description: string
    retries: number
    delayMilliseconds: number
    failureMessage: string
    fn(): Promise<void>
}): Promise<void> {
    for (let attempt = 0; attempt < parameters.retries; attempt++) {
        try {
            console.log(`${parameters.description}: Attempt ${attempt + 1}`)
            await parameters.fn()

            return
        } catch (err) {
            if (attempt + 1 >= parameters.retries) {
                assert.fail(parameters.failureMessage)
            }
        }

        await new Promise<any>(resolve => setTimeout(resolve, parameters.delayMilliseconds))
    }

    assert.fail(parameters.failureMessage)
}
