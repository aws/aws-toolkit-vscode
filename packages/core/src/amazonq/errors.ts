/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

/**
 * Shared error type for content length validation.
 * When thrown from common components, individual agents can catch and transform this error
 * to provide their own customized error messages.
 */
import { ToolkitError } from '../shared/errors'

export class ContentLengthError extends ToolkitError {
    constructor(message: string) {
        super(message, { code: 'ContentLengthError' })
    }
}
