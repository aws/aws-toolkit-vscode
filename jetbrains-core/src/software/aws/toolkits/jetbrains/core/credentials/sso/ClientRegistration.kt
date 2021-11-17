// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import java.time.Instant

/**
 * Client registration that represents the toolkit returned from [SsoOidcClient.registerClient].
 *
 * It should be persisted for reuse through many authentication requests.
 */
data class ClientRegistration(
    val clientId: String,
    val clientSecret: String,
    val expiresAt: Instant
)
