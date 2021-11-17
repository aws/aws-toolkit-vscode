// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

/**
 * Callback interface to allow for UI elements to react to the different stages of the SSO login flow
 */
interface SsoLoginCallback {
    /**
     * Called when a new authorization is pending within SSO service. User should be notified so they can perform the login flow.
     */
    fun tokenPending(authorization: Authorization)

    /**
     * Called when the user successfully logs into the SSO service.
     */
    fun tokenRetrieved()

    /**
     * Called when the SSO login fails
     */
    fun tokenRetrievalFailure(e: Exception)
}
