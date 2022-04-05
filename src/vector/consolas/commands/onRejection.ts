/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import { recommendations, invocationContext } from '../models/model'

export async function onRejection(isManualTriggerEnabled: boolean, isAutomatedTriggerEnabled: boolean) {
    /**
     * Skip when Consolas service is turned off
     */
    if (!isManualTriggerEnabled && !isAutomatedTriggerEnabled) {
        return
    }

    if (invocationContext.isActive && recommendations.response.length > 0) {
        invocationContext.isActive = false
        for (const entry of recommendations.response.entries()) {
            getLogger().info(`Rejected ${entry[0]} recommendation : ${entry[1].content.trim()}`)
        }
    }
}
