// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion

data class ConnectionSettings(val credentials: ToolkitCredentialsProvider, val region: AwsRegion)

val ConnectionSettings.shortName get() = "${credentials.shortName}@${region.id}"

fun ConnectionSettings.toEnvironmentVariables(): Map<String, String> = region.toEnvironmentVariables() +
    credentials.resolveCredentials().toEnvironmentVariables()

fun <T> Project.withAwsConnection(block: (ConnectionSettings) -> T): T {
    val connectionSettings = AwsConnectionManager.getInstance(this).connectionSettings()
        ?: throw IllegalStateException("Connection settings are not configured")
    return block(connectionSettings)
}
