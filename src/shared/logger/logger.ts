/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable } from './loggableType'

let toolkitLogger: Logger

export interface Logger {
    debug(...message: Loggable[]): void
    verbose(...message: Loggable[]): void
    info(...message: Loggable[]): void
    warn(...message: Loggable[]): void
    error(...message: Loggable[]): void
}

export type LogLevel = keyof Logger

/**
 * Gets the default logger if it has been initialized with the initialize() function
 */
export function getLogger(): Logger {
    if (toolkitLogger) {
        return toolkitLogger
    }
    throw new Error('Default Logger not initialized. Call logger.initialize() first.')
}

export function setLogger(logger: Logger) {
    toolkitLogger = logger
}
