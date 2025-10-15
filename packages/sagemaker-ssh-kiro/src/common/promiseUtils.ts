/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates a promise that resolves/rejects when the provided promise settles, or rejects when the timeout expires.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let isSettled = false

        const timeoutId = setTimeout(() => {
            if (!isSettled) {
                isSettled = true
                reject(new Error(`Operation timed out after ${timeoutMs}ms`))
            }
        }, timeoutMs)

        promise.then(
            (result) => {
                if (!isSettled) {
                    isSettled = true
                    clearTimeout(timeoutId)
                    resolve(result)
                }
            },
            (error) => {
                if (!isSettled) {
                    isSettled = true
                    clearTimeout(timeoutId)
                    reject(error)
                }
            }
        )
    })
}
