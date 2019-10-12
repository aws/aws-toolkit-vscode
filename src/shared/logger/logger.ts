/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable } from './loggableType'

let toolkitLogger: Logger | undefined

export interface Logger {
    debug(...message: Loggable[]): void
    verbose(...message: Loggable[]): void
    info(...message: Loggable[]): void
    warn(...message: Loggable[]): void
    error(...message: Loggable[]): void
}

export type LogLevel = keyof Logger

/**
 * Gets the logger if it has been initialized
 */
export function getLogger(): Logger {
    if (!toolkitLogger) {
        throw new Error(
            'Logger not initialized. Extension code should call initialize() from shared/logger/activation, test code should call setLogger().'
        )
    }

    return toolkitLogger
}

/**
 * Sets (or clears) the logger that is accessible to code.
 * The Extension is expected to call this only once.
 * Tests should call this to set up a logger prior to executing code that accesses a logger.
 */
export function setLogger(logger: Logger | undefined) {
    toolkitLogger = logger
}
