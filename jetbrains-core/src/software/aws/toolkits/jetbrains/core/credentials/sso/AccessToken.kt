// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.fasterxml.jackson.annotation.JsonInclude
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import java.time.Instant

/**
 * Access token returned from [SsoOidcClient.createToken] used to retrieve AWS Credentials from [SsoClient.getRoleCredentials].
 */
data class AccessToken(
    val startUrl: String,
    val region: String,
    val accessToken: String,
    @JsonInclude(JsonInclude.Include.NON_NULL)
    val refreshToken: String? = null,
    val expiresAt: Instant
)
