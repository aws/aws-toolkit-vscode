/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isCredentialExpirationError } from './smusUtils'
import { SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'

/**
 * Detects and handles credential expiration errors.
 *
 * If the provided error indicates expired credentials, it marks the connection as invalid.
 * This refreshes the SmusAuthInfo node to reflect the updated authentication state.
 *
 * @param err The error
 */
export async function handleCredExpiredError(err: any): Promise<void> {
    if (isCredentialExpirationError(err)) {
        const smusAuthProvider = SmusAuthenticationProvider.fromContext()
        await smusAuthProvider.invalidateConnection()
        smusAuthProvider.dispose()
    }
}
