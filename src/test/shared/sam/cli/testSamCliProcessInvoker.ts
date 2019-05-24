/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'

import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'

export class TestSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(
        private readonly onInvoke: (spawnOptions: SpawnOptions, ...args: any[]) => ChildProcessResult
    ) {
    }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        const args = typeof first === 'string' ? [first, ...rest] : rest
        const spawnOptions: SpawnOptions = typeof first === 'string' ? {} : first

        return this.onInvoke(spawnOptions, args)
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
