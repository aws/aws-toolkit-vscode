// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core

import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.credentials.toEnvironmentVariables
import software.aws.toolkits.core.region.AwsRegion

data class ConnectionSettings(val credentials: ToolkitCredentialsProvider, val region: AwsRegion)

val ConnectionSettings.shortName get() = "${credentials.shortName}@${region.id}"

fun ConnectionSettings.toEnvironmentVariables(): Map<String, String> = region.toEnvironmentVariables() +
    credentials.resolveCredentials().toEnvironmentVariables()
