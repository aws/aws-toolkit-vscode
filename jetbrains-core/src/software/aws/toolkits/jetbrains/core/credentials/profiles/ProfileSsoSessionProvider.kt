// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCredentialProvider

class ProfileSsoSessionProvider(ssoSession: Profile, profile: Profile) : AwsCredentialsProvider, SdkAutoCloseable {
    private val ssoClient: SsoClient
    private val ssoOidcClient: SsoOidcClient
    private val credentialsProvider: SsoCredentialProvider
    init {
        val clientManager = AwsClientManager.getInstance()

        val ssoRegion = ssoSession.requiredProperty(ProfileProperty.SSO_REGION)
        val startUrl = ssoSession.requiredProperty(ProfileProperty.SSO_START_URL)
        val scopes = ssoSession.ssoScopes()

        val accountId = profile.requiredProperty(ProfileProperty.SSO_ACCOUNT_ID)
        val roleName = profile.requiredProperty(ProfileProperty.SSO_ROLE_NAME)

        ssoClient = clientManager.createUnmanagedClient(AnonymousCredentialsProvider.create(), Region.of(ssoRegion))
        ssoOidcClient = clientManager.createUnmanagedClient(AnonymousCredentialsProvider.create(), Region.of(ssoRegion))

        val authProfile = UserConfigSsoSessionProfile(
            configSessionName = ssoSession.name(),
            ssoRegion = ssoRegion,
            startUrl = startUrl,
            scopes = scopes.toList()
        )

        val ssoAccessTokenProvider = ToolkitAuthManager.getInstance().getOrCreateSsoConnection(authProfile).getConnectionSettings().tokenProvider

        credentialsProvider = SsoCredentialProvider(
            accountId,
            roleName,
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
