// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.nhaarman.mockitokotlin2.mock
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources

fun fillResourceCache(resourceCache: MockResourceCache) {
    resourceCache.addEntry(
        EcsResources.LIST_CLUSTER_ARNS,
        listOf("arn2", "arn3")
    )

    resourceCache.addEntry(
        makeMockList("arn2"),
        listOf("service1", "service2")
    )

    resourceCache.addEntry(
        makeMockList("arn3"),
        listOf("service1", "service2")
    )
}

fun makeMockList(clusterArn: String): Resource.Cached<List<String>> =
    mock {
        on { id }.thenReturn("ecs.list_services.$clusterArn")
    }
