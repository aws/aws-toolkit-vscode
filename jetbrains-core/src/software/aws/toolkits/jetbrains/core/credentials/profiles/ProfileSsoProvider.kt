// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.utils.SdkAutoCloseable
import software.aws.toolkits.core.credentials.sso.SSO_ACCOUNT
import software.aws.toolkits.core.credentials.sso.SSO_REGION
import software.aws.toolkits.core.credentials.sso.SSO_ROLE_NAME
import software.aws.toolkits.core.credentials.sso.SSO_URL
import software.aws.toolkits.core.credentials.sso.SsoAccessTokenProvider
import software.aws.toolkits.core.credentials.sso.SsoCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.SsoPrompt
import software.aws.toolkits.jetbrains.core.credentials.diskCache

class ProfileSsoProvider(private val ssoClient: SsoClient, private val ssoOidcClient: SsoOidcClient, profile: Profile) :
    AwsCredentialsProvider, SdkAutoCloseable {
    private val credentialsProvider: SsoCredentialProvider

    init {
        val ssoRegion = profile.requiredProperty(SSO_REGION)
        val ssoAccessTokenProvider = SsoAccessTokenProvider(
            profile.requiredProperty(SSO_URL),
            ssoRegion,
            SsoPrompt,
            diskCache,
            ssoOidcClient
        )

        credentialsProvider = SsoCredentialProvider(
            profile.requiredProperty(SSO_ACCOUNT),
            profile.requiredProperty(SSO_ROLE_NAME),
            ssoClient,
            ssoAccessTokenProvider
        )
    }

    override fun resolveCredentials(): AwsCredentials = credentialsProvider.resolveCredentials()

    override fun close() {
        credentialsProvider.close()
        ssoClient.close()
        ssoOidcClient.close()
    }
}
