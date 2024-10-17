/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '..'
import { ChildProcess, ChildProcessOptions } from './processUtils'

/**
 * Tries to execute a program at path `p` with the given args and
 * optionally checks the output for `expected`.
 *
 * @param p path to a program to execute
 * @param args program args
 * @param doLog log failures
 * @param expected output must contain this string
 */
export async function tryRun(
    p: string,
    args: string[],
    logging: 'yes' | 'no' | 'noresult' = 'yes',
    expected?: string,
    opt?: ChildProcessOptions
): Promise<boolean> {
    const proc = new ChildProcess(p, args, { logging: 'no' })
    const r = await proc.run(opt)
    const ok = r.exitCode === 0 && (expected === undefined || r.stdout.includes(expected))
    if (logging === 'noresult') {
        getLogger().info('tryRun: %s: %s', ok ? 'ok' : 'failed', proc)
    } else if (logging !== 'no') {
        getLogger().info('tryRun: %s: %s %O', ok ? 'ok' : 'failed', proc, proc.result())
    }
    return ok
}
