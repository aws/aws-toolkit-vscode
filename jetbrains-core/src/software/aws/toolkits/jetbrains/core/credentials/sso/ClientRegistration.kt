// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.fasterxml.jackson.annotation.JsonInclude
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
    val expiresAt: Instant,
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    val scopes: List<String> = emptyList()
)

// only applicable in scoped registration path
// based on internal development branch @da780a4,L2574-2586
data class ClientRegistrationCacheKey(
    val startUrl: String,
    val scopes: List<String>,
)
