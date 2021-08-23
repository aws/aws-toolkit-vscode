// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import java.util.concurrent.CompletableFuture

object DynamicResources {
    val SUPPORTED_TYPES = getSupportedTypes()

    private fun getSupportedTypes(): CompletableFuture<List<String>> {
        val future = CompletableFuture<List<String>>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val reader = jacksonObjectMapper()
                future.complete(
                    DynamicResources.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")?.use { resourceStream ->
                        reader.readValue<Map<String, ResourceDetails>>(resourceStream).filter { it.value.operations.contains(Operation.LIST) }.map { it.key }
                    } ?: throw RuntimeException("dynamic resource manifest not found")
                )
            } catch (e: Throwable) {
                future.completeExceptionally(e)
            }
        }
        return future
    }

    fun listResources(typeName: String): Resource.Cached<List<DynamicResource>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.$typeName") {
            DynamicResourcesProvider(this@ClientBackedCachedResource).listResources(typeName)
        }

    fun listResources(resourceType: ResourceType): Resource.Cached<List<DynamicResource>> = listResources(resourceType.fullName)

    fun listTypesInCurrentRegion(): Resource.Cached<List<String>> = ClientBackedCachedResource(
        CloudFormationClient::class, "cloudformation.dynamic.resources.in.current.region"
    ) {
        this.listTypesPaginator {
            it.visibility(Visibility.PUBLIC)
            it.type(RegistryType.RESOURCE)
        }.flatMap { it.typeSummaries().map { it.typeName() } }
    }
}

data class ResourceDetails(val operations: List<Operation>, val arnRegex: String? = null)

enum class Operation {
    CREATE, READ, UPDATE, DELETE, LIST;
}
