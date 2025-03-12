/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../errors'
import { getLogger } from './logger'

export class PerfLog {
    private readonly log
    public readonly start

    public constructor(public readonly topic: string) {
        const log = getLogger()
        this.log = log
        this.start = performance.now()
    }

    public elapsed(): number {
        return performance.now() - this.start
    }

    public done(): void {
        if (!this.log.logLevelEnabled('verbose')) {
            return
        }
        const elapsed = this.elapsed()
        this.log.verbose('%s took %dms', this.topic, elapsed.toFixed(1))
    }
}

/**
 * Call a function f and if it fails, log the error with performance information included.
 * @param action label of action in the error log.
 * @param f action to attempt.
 * @param params params that were passed to f.
 * @param errMap optional mapping to apply to error to potentially add information.
 * @returns result of f
 */
export function withPerfLogOnFail<Result, E extends Error = never>(
    action: string,
    f: () => Result | Promise<Result>,
    params: object = {},
    errMap?: (e: Error) => E
) {
    return async function () {
        const perflog = new PerfLog(action)
        try {
            return await f()
        } catch (e) {
            if (e instanceof Error) {
                const errWithoutStack = errMap ? errMap(e) : { ...e }
                delete errWithoutStack['stack']
                const timecost = perflog.elapsed().toFixed(1)
                getLogger().error(
                    `${action} failed (time: %dms) \nparams: %O\nerror: %O`,
                    timecost,
                    params,
                    errWithoutStack
                )
                throw new ToolkitError(`${action}: ${e.message}`, { code: e.message, cause: e })
            }
            throw e
        }
    }
}
