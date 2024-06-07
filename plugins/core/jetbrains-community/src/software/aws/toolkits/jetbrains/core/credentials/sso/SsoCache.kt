// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

interface SsoCache {
    fun invalidateClientRegistration(ssoRegion: String)
    fun invalidateAccessToken(ssoUrl: String)

    fun loadClientRegistration(cacheKey: ClientRegistrationCacheKey): ClientRegistration?
    fun saveClientRegistration(cacheKey: ClientRegistrationCacheKey, registration: ClientRegistration)
    fun invalidateClientRegistration(cacheKey: ClientRegistrationCacheKey)

    fun loadAccessToken(cacheKey: AccessTokenCacheKey): AccessToken?
    fun saveAccessToken(cacheKey: AccessTokenCacheKey, accessToken: AccessToken)
    fun invalidateAccessToken(cacheKey: AccessTokenCacheKey)
}
