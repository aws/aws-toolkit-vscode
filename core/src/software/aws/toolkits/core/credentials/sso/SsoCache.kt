// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials.sso

interface SsoCache {
    fun loadClientRegistration(ssoRegion: String): ClientRegistration?
    fun saveClientRegistration(ssoRegion: String, registration: ClientRegistration)
    fun invalidateClientRegistration(ssoRegion: String)

    fun loadAccessToken(ssoUrl: String): AccessToken?
    fun saveAccessToken(ssoUrl: String, accessToken: AccessToken)
    fun invalidateAccessToken(ssoUrl: String)
}
