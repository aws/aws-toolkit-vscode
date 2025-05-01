/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChatResult } from '@aws/language-server-runtimes/protocol'
import { ResponseError } from '@aws/language-server-runtimes/protocol'
/**
 * Perform a sanity check that the error we got from the LSP can be safely cast to the expected type.
 * @param error
 * @returns
 */
export function isValidResponseError(error: unknown): error is ResponseError<ChatResult> & { data: ChatResult } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'number' &&
        'message' in error &&
        typeof error.message === 'string' &&
        'data' in error &&
        error.data !== undefined
    )
}
