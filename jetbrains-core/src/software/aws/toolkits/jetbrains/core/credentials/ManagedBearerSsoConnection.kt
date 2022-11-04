// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class ManagedBearerSsoConnection(
    val startUrl: String,
    val region: String,
    override val scopes: List<String>,
    private val prompt: SsoPrompt = SsoPrompt
) : BearerSsoConnection {
    override val id: String = ToolkitBearerTokenProvider.identifier(startUrl)
    override val label: String = ToolkitBearerTokenProvider.displayName(startUrl)

    override fun getConnectionSettings(): TokenConnectionSettings =
        TokenConnectionSettings(
            ToolkitBearerTokenProvider(
                InteractiveBearerTokenProvider(
                    startUrl,
                    region,
                    prompt,
                    scopes
                )
            ),
            AwsRegionProvider.getInstance().get(region) ?: error("Partition data is missing for $region")
        )
}
