/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ErrorCodes, ResponseError } from 'vscode-languageserver'

export function formatError(message: string, err: any): string {
    if (err instanceof Error) {
        const error = <Error>err

        return `${message}: ${error.message}\n${error.stack}`
    } else if (typeof err === 'string') {
        return `${message}: ${err}`
    } else if (err) {
        return `${message}: ${err.toString()}`
    }

    return message
}

export function runSafeAsync<T>(
    func: () => Thenable<T>,
    errorVal: T,
    errorMessage: string,
    token: CancellationToken
): Thenable<T | ResponseError<any>> {
    return new Promise<T | ResponseError<any>>(resolve => {
        setImmediate(() => {
            if (token.isCancellationRequested) {
                resolve(cancelValue())
            }

            return func().then(
                result => {
                    if (token.isCancellationRequested) {
                        resolve(cancelValue())

                        return
                    } else {
                        resolve(result)
                    }
                },
                e => {
                    console.error(formatError(errorMessage, e))
                    resolve(errorVal)
                }
            )
        })
    })
}

export function runSafe<T, E>(
    func: () => T,
    errorVal: T,
    errorMessage: string,
    token: CancellationToken
): Thenable<T | ResponseError<E>> {
    return new Promise<T | ResponseError<E>>(resolve => {
        setImmediate(() => {
            if (token.isCancellationRequested) {
                resolve(cancelValue())
            } else {
                try {
                    const result = func()
                    if (token.isCancellationRequested) {
                        resolve(cancelValue())

                        return
                    } else {
                        resolve(result)
                    }
                } catch (e) {
                    console.error(formatError(errorMessage, e))
                    resolve(errorVal)
                }
            }
        })
    })
}

function cancelValue<E>() {
    console.log('cancelled')

    return new ResponseError<E>(ErrorCodes.RequestCancelled, 'Request cancelled')
}
