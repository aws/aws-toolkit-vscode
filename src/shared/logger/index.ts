/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// This file is the common import file, intended for use by most extension code.
// It surfaces Logger and related interfaces, types, and retrieval.
import * as logger from './logger'
export { showLogOutputChannel } from './outputChannel'

export type Loggable = Error | string

export type Logger = logger.Logger
export type LogLevel = logger.LogLevel
export const getLogger = logger.getLogger
export const getNullLogger = logger.getNullLogger
