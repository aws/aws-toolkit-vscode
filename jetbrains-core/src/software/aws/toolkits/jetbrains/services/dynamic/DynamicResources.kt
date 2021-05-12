// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object DynamicResources {
    val SUPPORTED_TYPES: Resource.Cached<List<ResourceType>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.supported_types") {
            runBlocking {
                DynamicResourcesProvider(this@ClientBackedCachedResource).listSupportedTypes()
            }
        }

    fun listResources(resourceType: ResourceType): Resource.Cached<List<DynamicResource>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.$resourceType") {
            runBlocking {
                DynamicResourcesProvider(this@ClientBackedCachedResource).listResources(resourceType)
            }
        }
}
