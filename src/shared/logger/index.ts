/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as loggableType from './loggableType'
import * as logger from './logger'

export type ErrorOrString = loggableType.Loggable

export type Logger = logger.Logger
export type LogLevel = logger.LogLevel
export const getLogger = logger.getLogger
