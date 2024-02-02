// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.jetbrains.core.credentials.DefaultConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.DetectedDiskSsoSessionConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitStartupAuthFactory
import software.aws.toolkits.jetbrains.core.credentials.profiles.ssoScopes
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv
import software.aws.toolkits.resources.message
import kotlin.jvm.optionals.getOrNull

class SonoDiskProfileAuthFactory : ToolkitStartupAuthFactory {
    override fun buildConnections(): List<ToolkitConnection> {
        return if (!isCodeCatalystDevEnv()) {
            emptyList()
        } else {
            val profile = DefaultConfigFilesFacade().readSsoSessions().get("codecatalyst") ?: return emptyList()
            val startUrl = profile.property(ProfileProperty.SSO_START_URL)?.getOrNull() ?: return emptyList()
            val region = profile.property(ProfileProperty.SSO_REGION)?.getOrNull() ?: return emptyList()
            val scopes = profile.ssoScopes(withDefault = false).toList()
            val name = if (startUrl == SONO_URL) message("aws_builder_id.service_name") else null

            return listOf(
                DetectedDiskSsoSessionConnection("codecatalyst", startUrl, region, scopes, name)
            )
        }
    }
}
