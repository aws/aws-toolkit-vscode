// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import java.time.Instant

/**
 * Returned by [SsoOidcClient.startDeviceAuthorization] that contains the required data to construct the user visible SSO login flow.
 */
data class Authorization(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val verificationUriComplete: String,
    val expiresAt: Instant,
    val pollInterval: Long,
    val createdAt: Instant
)
