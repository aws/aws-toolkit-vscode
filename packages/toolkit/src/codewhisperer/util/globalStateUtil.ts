/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { vsCodeState } from '../models/model'

export function resetIntelliSenseState(
    isManualTriggerEnabled: boolean,
    isAutomatedTriggerEnabled: boolean,
    hasResponse: boolean
) {
    /**
     * Skip when CodeWhisperer service is turned off
     */
    if (!isManualTriggerEnabled && !isAutomatedTriggerEnabled) {
        return
    }

    if (vsCodeState.isIntelliSenseActive && hasResponse) {
        vsCodeState.isIntelliSenseActive = false
    }
}
