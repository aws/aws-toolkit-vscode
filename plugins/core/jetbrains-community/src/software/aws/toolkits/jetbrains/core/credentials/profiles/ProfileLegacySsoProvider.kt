// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.utils.SdkAutoCloseable
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoAccessTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCache
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCredentialProvider

class ProfileLegacySsoProvider(ssoCache: SsoCache, profile: Profile) : AwsCredentialsProvider, SdkAutoCloseable {
    private val ssoClient: SsoClient
    private val ssoOidcClient: SsoOidcClient
    private val credentialsProvider: SsoCredentialProvider

    init {
        val ssoRegion = profile.requiredProperty(ProfileProperty.SSO_REGION)
        val clientManager = AwsClientManager.getInstance()

        ssoClient = clientManager.createUnmanagedClient(AnonymousCredentialsProvider.create(), Region.of(ssoRegion))
        ssoOidcClient = clientManager.createUnmanagedClient(AnonymousCredentialsProvider.create(), Region.of(ssoRegion))

        val ssoAccessTokenProvider = SsoAccessTokenProvider(
            profile.requiredProperty(ProfileProperty.SSO_START_URL),
            ssoRegion,
            ssoCache,
            ssoOidcClient,
            isAlwaysShowDeviceCode = true,
        )

        credentialsProvider = SsoCredentialProvider(
            profile.requiredProperty(ProfileProperty.SSO_ACCOUNT_ID),
            profile.requiredProperty(ProfileProperty.SSO_ROLE_NAME),
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
