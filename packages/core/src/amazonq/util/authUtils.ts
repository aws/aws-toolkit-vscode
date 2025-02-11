/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureAuthState } from '../../codewhisperer/util/authUtil'
import { AuthFollowUpType, AuthMessageDataMap } from '../auth/model'

/**
 * This function evaluates the authentication state of CodeWhisperer features (chat and core)
 * when the authentication is not valid, and returns the appropriate authentication follow-up type and message.
 *
 * @param credentialState - The current authentication state for each CodeWhisperer feature
 * @returns An object containing:
 *   - authType: The type of authentication follow-up required (AuthFollowUpType)
 *   - message: The corresponding message for the determined auth type
 */
export function extractAuthFollowUp(credentialState: FeatureAuthState) {
    let authType: AuthFollowUpType = 'full-auth'
    let message = AuthMessageDataMap[authType].message
    if (credentialState.codewhispererChat === 'disconnected' && credentialState.codewhispererCore === 'disconnected') {
        authType = 'full-auth'
        message = AuthMessageDataMap[authType].message
    }

    if (credentialState.codewhispererCore === 'connected' && credentialState.codewhispererChat === 'expired') {
        authType = 'missing_scopes'
        message = AuthMessageDataMap[authType].message
    }

    if (credentialState.codewhispererChat === 'expired' && credentialState.codewhispererCore === 'expired') {
        authType = 're-auth'
        message = AuthMessageDataMap[authType].message
    }

    return {
        authType,
        message,
    } as const
}
