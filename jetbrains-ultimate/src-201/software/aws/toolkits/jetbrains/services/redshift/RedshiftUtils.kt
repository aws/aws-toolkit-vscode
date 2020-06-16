// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.redshift.model.Cluster
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.sts.StsResources

fun Project.clusterArn(cluster: Cluster, region: AwsRegion): String {
    // Attempt to get account out of the cache. If not, it's empty so, it is still a valid arn
    val account = tryOrNull { AwsResourceCache.getInstance(this).getResourceIfPresent(StsResources.ACCOUNT) } ?: ""
    return "arn:${region.partitionId}:redshift:${region.id}:$account:cluster:${cluster.clusterIdentifier()}"
}
