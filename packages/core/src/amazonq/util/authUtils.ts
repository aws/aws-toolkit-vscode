/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureAuthState } from '../../codewhisperer'
import { AuthFollowUpType, AuthMessageDataMap } from '../auth/model'

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
