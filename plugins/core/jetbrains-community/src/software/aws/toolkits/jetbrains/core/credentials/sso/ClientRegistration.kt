// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.utils.SensitiveField
import software.aws.toolkits.core.utils.redactedString
import java.time.Instant

/**
 * Client registration that represents the toolkit returned from [SsoOidcClient.registerClient].
 *
 * It should be persisted for reuse through many authentication requests.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION, defaultImpl = DeviceAuthorizationClientRegistration::class)
@JsonSubTypes(value = [JsonSubTypes.Type(DeviceAuthorizationClientRegistration::class), JsonSubTypes.Type(PKCEClientRegistration::class) ])
sealed interface ClientRegistration {
    val clientId: String

    @SensitiveField
    val clientSecret: String

    val expiresAt: Instant

    @get:JsonInclude(JsonInclude.Include.NON_EMPTY)
    val scopes: List<String>
}

data class DeviceAuthorizationClientRegistration(
    override val clientId: String,
    override val clientSecret: String,
    override val expiresAt: Instant,
    override val scopes: List<String> = emptyList(),
) : ClientRegistration {
    override fun toString(): String = redactedString(this)
}

data class PKCEClientRegistration(
    override val clientId: String,
    override val clientSecret: String,
    override val expiresAt: Instant,
    override val scopes: List<String>,
    // fields below are implied from the key, but trying reverse the key is annoying
    val issuerUrl: String,
    val region: String,
    val clientType: String,
    val grantTypes: List<String>,
    val redirectUris: List<String>,
) : ClientRegistration {
    override fun toString(): String = redactedString(this)
}

sealed interface ClientRegistrationCacheKey

// only applicable in scoped registration path
// based on internal development branch @da780a4,L2574-2586
data class DeviceAuthorizationClientRegistrationCacheKey(
    val startUrl: String,
    val scopes: List<String>,
    val region: String,
) : ClientRegistrationCacheKey

data class PKCEClientRegistrationCacheKey(
    val issuerUrl: String,
    val region: String,
    val scopes: List<String>,
    // assume clientType, grantTypes, redirectUris are static, but throw them in just in case
    val clientType: String,
    val grantTypes: List<String>,
    val redirectUris: List<String>
) : ClientRegistrationCacheKey
