/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

/**
 * Copied from src/vs/base/common/async.ts
 */
export function isThenable<T>(obj: any): obj is Promise<T> {
    return obj && typeof (<Promise<any>>obj).then === 'function'
}

/**
 * Sleeps for the specified duration in milliseconds. Note that a duration of 0 will always wait 1 event loop.
 *
 * Attempts to use the extension-scoped `setTimeout` if it exists, otherwise will fallback to the global scheduler.
 */
export function sleep(duration: number = 0): Promise<void> {
    const schedule = globals?.clock?.setTimeout ?? setTimeout
    return new Promise(r => schedule(r, Math.max(duration, 0)))
}
