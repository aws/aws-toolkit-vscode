/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SpawnOptions } from 'child_process'

import { TestLogger } from '../../../../shared/loggerUtils'
import {
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker
} from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'

export class TestSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(
        private readonly onInvoke: (spawnOptions: SpawnOptions, ...args: any[]) => ChildProcessResult
    ) {
    }

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
        stderr = 'stderr message',
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
            stderr: this.stderr,
        }

        return result
    }
}

export class FakeChildProcessResult implements ChildProcessResult {
    public exitCode: number
    public error: Error | undefined
    public stdout: string
    public stderr: string

    public constructor(
        {
            exitCode = 0,
            stdout = '',
            stderr = '',
            ...params
        }: Partial<ChildProcessResult>
    ) {
        this.exitCode = exitCode
        this.error = params.error
        this.stdout = stdout
        this.stderr = stderr
    }
}

export function assertErrorContainsBadExitMessage(
    actualError: Error,
    sourceErrorMessage: string
) {
    assert.strictEqual(
        actualError.message, `Error with child process: ${sourceErrorMessage}`,
        'Unexpected error message'
    )
}

export async function assertLogContainsBadExitInformation(
    logger: TestLogger,
    errantChildProcessResult: ChildProcessResult,
    expectedExitCode: number,
): Promise<void> {
    assert.ok(
        // tslint:disable-next-line:max-line-length
        await logger.logContainsText(`Unexpected exitcode (${errantChildProcessResult.exitCode}), expecting (${expectedExitCode})`),
        'Log message missing for exit code'
    )
    assert.ok(
        await logger.logContainsText(`Error: ${errantChildProcessResult.error}`),
        'Log message missing for error'
    )
    assert.ok(
        await logger.logContainsText(`stderr: ${errantChildProcessResult.stderr}`),
        'Log message missing for stderr'
    )
    assert.ok(
        await logger.logContainsText(`stdout: ${errantChildProcessResult.stdout}`),
        'Log message missing for stdout'
    )
}
