// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants

object EcsUtils {
    @JvmStatic
    fun clusterArnToName(clusterArn: String): String = clusterArn.split("cluster/", limit = 2).last()

    @JvmStatic
    fun serviceArnToName(serviceArn: String): String = serviceArn.split("/").last()

    @JvmStatic
    fun originalServiceName(serviceName: String): String = serviceArnToName(serviceName).removePrefix(CloudDebugConstants.CLOUD_DEBUG_RESOURCE_PREFIX)

    /**
     * project is the active project
     * service is service name or ARN
     */
    @JvmStatic
    fun isInstrumented(service: String): Boolean = serviceArnToName(service).startsWith(CloudDebugConstants.CLOUD_DEBUG_RESOURCE_PREFIX)
}
