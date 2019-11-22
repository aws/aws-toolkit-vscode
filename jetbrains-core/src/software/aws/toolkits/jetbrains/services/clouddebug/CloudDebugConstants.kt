// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import software.aws.toolkits.core.utils.AttributeBagKey

object CloudDebugConstants {
    const val CLOUD_DEBUG_RESOURCE_PREFIX = "cloud-debug-"
    const val INSTRUMENTED_STATUS = "ENABLED"
    const val CLOUD_DEBUG_SIDECAR_CONTAINER_NAME = "${CLOUD_DEBUG_RESOURCE_PREFIX}sidecar-container"
    const val DEFAULT_REMOTE_DEBUG_PORT = 20020
    const val REMOTE_DEBUG_PORT_ENV = "REMOTE_DEBUG_PORT"
    val INSTRUMENT_IAM_ROLE_KEY: AttributeBagKey<String> = AttributeBagKey.create("instrumentIAMRoleKey")
    val RUNTIMES_REQUIRING_BEFORE_TASK = listOf(
        CloudDebuggingPlatform.JVM
    )
}
