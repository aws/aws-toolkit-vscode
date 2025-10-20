/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates a promise that rejects when the specified timeout is reached.
 *
 * Usage:
 * ```
 * await Promise.race([
 *     rejectAfterSecondsElapsed(10, new Error('Timed out while doing X.')),
 *     someOtherPromise
 * ])
 * ```
 *
 * Tip: If you are using the return value of the other promise, you can supply the type of its return value to this
 * function's type parameter to the same value to avoid TypeScript warnings.
 */
export function rejectAfterSecondsElapsed<T>(timeoutSeconds: number, error: any): Promise<T> {
    return new Promise((resolve, reject) => setTimeout(() => reject(error), timeoutSeconds * 1000))
}
