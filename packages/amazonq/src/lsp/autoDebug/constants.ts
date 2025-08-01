/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants for AutoDebug feature retry configuration
 */
export const autoDebugRetryConfig = {
    /**
     * Maximum number of attempts to connect AutoDebug feature to language client
     */
    maxAttempts: 3,

    /**
     * Initial delay in milliseconds before first retry attempt
     */
    initialDelayMs: 1000,

    /**
     * Maximum delay in milliseconds between retry attempts
     */
    maxDelayMs: 10000,

    /**
     * Multiplier for exponential backoff calculation
     */
    backoffMultiplier: 2,
} as const
