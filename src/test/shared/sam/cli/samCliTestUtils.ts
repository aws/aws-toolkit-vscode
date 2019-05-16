/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'

export class MockSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(
        private readonly validateArgs: (args: string[]) => void
    ) {
    }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        const args: string[] = typeof first === 'string' ? [first, ...rest] : rest
        this.validateArgs(args)

        return {
            exitCode: 0
        } as any as ChildProcessResult
    }
}
