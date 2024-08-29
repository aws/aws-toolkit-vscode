// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.webview

import com.intellij.openapi.util.registry.Registry
import software.aws.toolkits.telemetry.AuthType

fun getAuthType(region: String = "us-east-1"): AuthType {
    val isCommercialRegion = !region.startsWith("us-gov") && !region.startsWith("us-iso") && !region.startsWith("cn")
    if (!Registry.`is`("aws.dev.useDAG") && isCommercialRegion) {
        return AuthType.PKCE
    } else {
        return AuthType.DeviceCode
    }
}
