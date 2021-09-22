// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.arns.Arn
import software.amazon.awssdk.services.cloudcontrol.CloudControlClient
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import java.io.File

object DynamicResources {
    private val mapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    val SUPPORTED_TYPES by lazy {
        if (ApplicationManager.getApplication().isDispatchThread) {
            throw IllegalStateException("Access from Event Dispatch Thread")
        } else {
            DynamicResources.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")?.use { resourceStream ->
                mapper.readValue<Map<String, ResourceDetails>>(resourceStream).filter { it.value.operations.contains(PermittedOperation.LIST) }.map { it.key }
            } ?: throw RuntimeException("dynamic resource manifest not found")
        }
    }

    fun listResources(typeName: String): Resource.Cached<List<DynamicResource>> =
        ClientBackedCachedResource(CloudControlClient::class, "cloudformation.dynamic.resources.$typeName") {
            this.listResourcesPaginator {
                it.typeName(typeName)
            }.flatMap {
                it.resourceDescriptions().map { resource ->
                    DynamicResource(resourceTypeFromResourceTypeName(it.typeName()), resource.identifier())
                }
            }
        }

    fun resourceTypeFromResourceTypeName(typeName: String): ResourceType {
        val (_, svc, type) = typeName.split("::")
        return ResourceType(typeName, svc, type)
    }

    fun listResources(resourceType: ResourceType): Resource.Cached<List<DynamicResource>> = listResources(resourceType.fullName)

    fun getResourceDisplayName(identifier: String): String =
        if (identifier.startsWith("arn:")) {
            Arn.fromString(identifier).resourceAsString()
        } else {
            identifier
        }

    fun getResourceSchema(resourceType: String): Resource.Cached<File> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.schema.$resourceType") {
            val schema = this.describeType {
                it.type(RegistryType.RESOURCE)
                it.typeName(resourceType)
            }.schema()
            val file = File("$resourceType.json")
            file.writeText(schema)
            file
        }

    fun listTypes(): Resource.Cached<List<String>> = ClientBackedCachedResource(
        CloudFormationClient::class, "cloudformation.listTypes"
    ) {
        this.listTypesPaginator {
            it.visibility(Visibility.PUBLIC)
            it.type(RegistryType.RESOURCE)
        }.flatMap { it.typeSummaries().map { it.typeName() } }
    }
}

data class ResourceDetails(val operations: List<PermittedOperation>, val arnRegex: String?, val documentation: String?)

enum class PermittedOperation {
    CREATE, READ, UPDATE, DELETE, LIST;
}
