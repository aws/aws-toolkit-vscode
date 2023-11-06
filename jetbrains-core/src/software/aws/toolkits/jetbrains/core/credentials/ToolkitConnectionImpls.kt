// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.ProfileSdkTokenProviderWrapper
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class ManagedBearerSsoConnection(
    override val startUrl: String,
    override val region: String,
    override val scopes: List<String>,
    cache: DiskCache = diskCache,
    id: String? = null,
    label: String? = null
) : BearerSsoConnection, Disposable {
    override val id: String = id ?: ToolkitBearerTokenProvider.ssoIdentifier(startUrl, region)
    override val label: String = label ?: ToolkitBearerTokenProvider.ssoDisplayName(startUrl)

    private val provider =
        tokenConnection(
            InteractiveBearerTokenProvider(
                startUrl,
                region,
                scopes,
                id,
                cache
            ),
            region
        )

    override fun getConnectionSettings(): TokenConnectionSettings = provider

    override fun dispose() {
        disposeProviderIfRequired(provider)
    }
}

class DetectedDiskSsoSessionConnection(
    val sessionProfileName: String,
    override val startUrl: String,
    override val region: String,
    displayNameOverride: String? = null
) : AwsBearerTokenConnection, Disposable {
    override val id = ToolkitBearerTokenProvider.diskSessionIdentifier(sessionProfileName)
    override val label = displayNameOverride ?: ToolkitBearerTokenProvider.diskSessionDisplayName(sessionProfileName)

    private val provider =
        tokenConnection(
            ProfileSdkTokenProviderWrapper(
                sessionName = sessionProfileName,
                region = region
            ),
            region
        )

    override fun getConnectionSettings(): TokenConnectionSettings = provider

    override fun dispose() {
        disposeProviderIfRequired(provider)
    }
}

private fun tokenConnection(provider: BearerTokenProvider, region: String) =
    TokenConnectionSettings(
        ToolkitBearerTokenProvider(provider),
        AwsRegionProvider.getInstance().get(region) ?: error("Partition data is missing for $region")
    )

private fun disposeProviderIfRequired(settings: TokenConnectionSettings) {
    val delegate = settings.tokenProvider.delegate
    if (delegate is Disposable) {
        Disposer.dispose(delegate)
    }
}
