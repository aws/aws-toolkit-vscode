/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maximum number of retry attempts for an approach request.
 * @type {number}
 */
export const approachRetryLimit = 3

/**
 * Maximum number of retry attempts for a code generation request.
 * @type {number}
 */
export const codeGenRetryLimit = 3

/**
 * Default retry limit when a session is not found.
 * @type {number}
 */
export const defaultRetryLimit = 0

/**
 * Maximum size (in bytes) for an uploaded file (1024 KB).
 * @type {number}
 */
export const maxFileSizeBytes = 1024000
