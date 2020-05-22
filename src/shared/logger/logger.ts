/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

let toolkitLogger: Logger | undefined

export interface Logger {
    debug(message: string, ...meta: any[]): void
    debug(error: Error): void
    verbose(message: string, ...meta: any[]): void
    verbose(error: Error): void
    info(message: string, ...meta: any[]): void
    info(error: Error): void
    warn(message: string, ...meta: any[]): void
    warn(error: Error): void
    error(message: string, ...meta: any[]): void
    error(error: Error): void
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
