/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SpawnOptions } from 'child_process'

import { isError } from 'lodash'
import {
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker,
} from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { TestLogger } from '../../../testLogger'

export class TestSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(private readonly onInvoke: (spawnOptions: SpawnOptions, ...args: any[]) => ChildProcessResult) {}

    public stop(): void {}
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
    const expectedTexts = [
        {
            text: `SAM CLI failed (exitcode: ${errantChildProcessResult.exitCode}, expected ${expectedExitCode}`,
            verifyMessage: 'Log message missing for exit code',
        },
    ]

    const logText = logger
        .getLoggedEntries()
        .filter(x => !isError(x))
        .join('\n')
    expectedTexts.forEach(expectedText => {
        assert.ok(logText.includes(expectedText.text), expectedText.verifyMessage)
    })
}
