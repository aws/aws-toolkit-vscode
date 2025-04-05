/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererStreamingServiceException } from '@amzn/codewhisperer-streaming'
import { getHttpStatusCode, getRequestId } from '../errors'

export interface MessageErrorInfo {
    errorMessage: string
    statusCode?: number
    requestId?: string
}

export function extractErrorInfo(error: any): MessageErrorInfo {
    let errorMessage = 'Error reading chat stream.'
    let statusCode = undefined
    let requestId = undefined

    if (error instanceof CodeWhispererStreamingServiceException) {
        errorMessage = error.message
        statusCode = getHttpStatusCode(error) ?? 0
        requestId = getRequestId(error)
    }

    return {
        errorMessage,
        statusCode,
        requestId,
    }
}
