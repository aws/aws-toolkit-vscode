/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { AmazonQPromptSettings } from '../../shared/settings'

/**
 * If the previous global state was acknowledged, then suppress the prompt and set global state to false
 * Otherwise, the new flows will enable amazonQChatDisclaimerAcknowledged directly
 */
export async function disclaimerAcknowledged(): Promise<boolean> {
    const acknowledged = globals.globalState.tryGet('aws.amazonq.disclaimerAcknowledged', Boolean, false)
    if (acknowledged) {
        await AmazonQPromptSettings.instance.update('amazonQChatDisclaimerAcknowledged', true)
        await globals.globalState.update('aws.amazonq.disclaimerAcknowledged', false)
    }

    return AmazonQPromptSettings.instance.get('amazonQChatDisclaimerAcknowledged', false)
}
