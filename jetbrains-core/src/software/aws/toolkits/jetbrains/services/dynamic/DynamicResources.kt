// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object DynamicResources {
    private val mapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    val SUPPORTED_TYPES by lazy {
        if (ApplicationManager.getApplication().isDispatchThread) {
            throw IllegalStateException("Access from Event Dispatch Thread")
            listOf()
        } else {
            DynamicResources.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")?.use { resourceStream ->
                mapper.readValue<Map<String, ResourceDetails>>(resourceStream).filter { it.value.operations.contains(Operation.LIST) }.map { it.key }
            } ?: throw RuntimeException("dynamic resource manifest not found")
        }
    }

    fun listResources(typeName: String): Resource.Cached<List<DynamicResource>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.$typeName") {
            DynamicResourcesProvider(this@ClientBackedCachedResource).listResources(typeName)
        }

    fun listResources(resourceType: ResourceType): Resource.Cached<List<DynamicResource>> = listResources(resourceType.fullName)

    fun listTypes(): Resource.Cached<List<String>> = ClientBackedCachedResource(
        CloudFormationClient::class, "cloudformation.listTypes"
    ) {
        this.listTypesPaginator {
            it.visibility(Visibility.PUBLIC)
            it.type(RegistryType.RESOURCE)
        }.flatMap { it.typeSummaries().map { it.typeName() } }
    }

    private val LOGGER = getLogger<DynamicResources>()
}

data class ResourceDetails(val operations: List<Operation>, val arnRegex: String?, val documentation: String?)

enum class Operation {
    CREATE, READ, UPDATE, DELETE, LIST;
}
