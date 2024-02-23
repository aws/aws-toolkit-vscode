// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.resources

import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.ecs.model.ServiceNotFoundException
import software.amazon.awssdk.services.ecs.model.TaskDefinition
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.resources.message

object EcsResources {
    val LIST_CLUSTER_ARNS: Resource.Cached<List<String>> =
        ClientBackedCachedResource(EcsClient::class, "ecs.list_clusters") {
            listClustersPaginator().clusterArns().toList()
        }

    fun listServiceArns(clusterArn: String): Resource.Cached<List<String>> =
        ClientBackedCachedResource(EcsClient::class, "ecs.list_services.$clusterArn") {
            listServicesPaginator { it.cluster(clusterArn) }.serviceArns().toList()
        }

    fun describeService(clusterArn: String, serviceArn: String): Resource.Cached<Service> =
        ClientBackedCachedResource(EcsClient::class, "ecs.describe_service.$clusterArn.$serviceArn") {
            describeServices { it.cluster(clusterArn).services(serviceArn) }.services().firstOrNull()
                ?: throw ServiceNotFoundException.builder().message(message("ecs.service.not_found", serviceArn, clusterArn)).build()
        }

    fun describeTaskDefinition(familyName: String): Resource.Cached<TaskDefinition> =
        ClientBackedCachedResource(EcsClient::class, "ecs.task_definition.$familyName") {
            describeTaskDefinition { it.taskDefinition(familyName) }.taskDefinition()
        }

    fun listTasks(clusterArn: String, serviceArn: String): Resource.Cached<List<String>> =
        ClientBackedCachedResource(EcsClient::class, "ecs.task_list.$clusterArn.$serviceArn") {
            listTasksPaginator { it.cluster(clusterArn).serviceName(serviceArn) }.taskArns().toList()
        }

    fun listTaskIds(clusterArn: String, serviceArn: String) = listTasks(clusterArn, serviceArn).map { it.substringAfterLast("/") }

    fun listContainers(taskDefinitionArn: String): Resource<List<ContainerDefinition>> =
        Resource.view(describeTaskDefinition(taskDefinitionArn)) { containerDefinitions() }
}
