// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope

object DynamicResources : Disposable {
    private val coroutineScope = ApplicationThreadPoolScope("DynamicResources", this)

    val SUPPORTED_TYPES: Deferred<List<String>> =
        coroutineScope.async(start = CoroutineStart.LAZY) {
            val reader = jacksonObjectMapper()
            DynamicResources.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")?.use { resourceStream ->
                reader.readValue<Map<String, ResourceDetails>>(resourceStream).filter { it.value.operations.contains(Operation.LIST) }.map { it.key }
            } ?: throw RuntimeException("dynamic resource manifest not found")
        }

    fun listResources(typeName: String): Resource.Cached<List<DynamicResource>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.$typeName") {
            DynamicResourcesProvider(this@ClientBackedCachedResource).listResources(typeName)
        }

    fun listResources(resourceType: ResourceType): Resource.Cached<List<DynamicResource>> = listResources(resourceType.fullName)

    override fun dispose() {}
}

data class ResourceDetails(val operations: List<Operation>, val arnRegex: String? = null)

enum class Operation {
    CREATE, READ, UPDATE, DELETE, LIST;
}
