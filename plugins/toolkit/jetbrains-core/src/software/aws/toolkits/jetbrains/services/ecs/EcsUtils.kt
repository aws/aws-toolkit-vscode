// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

object EcsUtils {
    @JvmStatic
    fun clusterArnToName(clusterArn: String): String = clusterArn.split("cluster/", limit = 2).last()

    @JvmStatic
    fun serviceArnToName(serviceArn: String): String = serviceArn.split("/").last()
}
