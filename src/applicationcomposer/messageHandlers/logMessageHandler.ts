/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogMessage } from '../types'
import { getLogger } from '../../shared/logger'

export function logMessageHandler(message: LogMessage) {
    const logger = getLogger()
    switch (message.logType) {
        case 'INFO':
            logger.info(message.logMessage)
            return
        case 'WARNING':
            logger.warn(message.logMessage)
            return
        case 'ERROR':
            logger.error(message.logMessage)
            return
    }
}
