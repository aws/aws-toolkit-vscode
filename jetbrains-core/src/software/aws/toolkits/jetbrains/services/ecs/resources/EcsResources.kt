// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.resources

import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object EcsResources {
    val LIST_CLUSTER_ARNS: Resource.Cached<List<String>> =
        ClientBackedCachedResource(EcsClient::class, "ecs.list_clusters") {
            listClustersPaginator().clusterArns().toList()
        }

    val LIST_TASK_DEFINITION_FAMILIES: Resource.Cached<List<String>> =
        ClientBackedCachedResource(EcsClient::class, "ecs.list_task_definition_families") {
            listTaskDefinitionFamiliesPaginator().families().toList()
        }

    fun listServiceArns(clusterArn: String): Resource.Cached<List<String>> =
        ClientBackedCachedResource(EcsClient::class, "ecs.list_services.$clusterArn") {
            listServicesPaginator { it.cluster(clusterArn) }.serviceArns().toList()
        }

    fun describeService(clusterArn: String, serviceArn: String): Resource.Cached<Service> =
        ClientBackedCachedResource(EcsClient::class, "ecs.describe_service.$clusterArn.$serviceArn") {
            describeServices { it.cluster(clusterArn).services(serviceArn) }.services().first()
        }
}