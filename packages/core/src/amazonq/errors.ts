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
import { ErrorInformation, ToolkitError } from '../shared/errors'

/**
 * Errors extending this class are considered "LLM failures" in service metrics.
 */
export class LlmError extends ToolkitError {
    constructor(message: string, info: ErrorInformation = {}) {
        super(message, info)
    }
}
