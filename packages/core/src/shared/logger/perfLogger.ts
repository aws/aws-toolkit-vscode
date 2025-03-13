/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

// /**
//  * Call a function f and if it fails, log the error with performance information included.
//  * @param action label of action to include in the error log.
//  * @param f action to attempt.
//  * @param params params that were passed to f. Defaults to empty.
//  * @param getCode optional mapping to extract code from error. Defaults to name of error.
//  * @returns result of f
//  */
// export function withPerfLogOnFail<Result>(
//     action: string,
//     f: () => Result,
//     params?: object,
//     getCode?: (e: Error) => string
// ): () => Result
// export function withPerfLogOnFail<Result>(
//     action: string,
//     f: () => Promise<Result>,
//     params?: object,
//     getCode?: (e: Error) => string
// ): () => Promise<Result>
// export function withPerfLogOnFail<Result>(
//     action: string,
//     f: () => Result | Promise<Result>,
//     params?: object,
//     getCode?: (e: Error) => string
// ) {
//     return function () {
//         const perflog = new PerfLog(action)
//         try {
//             return f()
//         } catch (e) {
//             if (e instanceof Error) {
//                 const errWithoutStack = { ...e, name: e.name, message: e.message }
//                 delete errWithoutStack['stack']
//                 const timecost = perflog.elapsed().toFixed(1)
//                 getLogger().error(
//                     `${action} failed (time: %dms) \nparams: %O\nerror: %O`,
//                     timecost,
//                     params ?? {},
//                     errWithoutStack
//                 )
//                 throw new ToolkitError(`${action}: ${errWithoutStack.message}`, {
//                     code: getCode ? getCode(errWithoutStack) : errWithoutStack.name,
//                     cause: errWithoutStack,
//                 })
//             }
//             throw e
//         }
//     }
// }
