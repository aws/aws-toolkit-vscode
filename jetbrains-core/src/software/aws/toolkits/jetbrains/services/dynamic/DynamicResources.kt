// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.jetbrains.jsonSchema.JsonSchemaMappingsProjectConfiguration
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import com.jetbrains.jsonSchema.impl.JsonSchemaServiceImpl
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import software.amazon.awssdk.arns.Arn
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import java.io.File

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

    fun getResourceDisplayName(identifier: String): String =
        if (identifier.startsWith("arn:")) {
            Arn.fromString(identifier).resourceAsString()
        } else {
            identifier
        }

    fun getResourceSchema(project: Project, resourceType: String): Resource.Cached<File> = ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.schema.$resourceType") {
        val client = project.awsClient<CloudFormationClient>()
        val schema = client.describeType {
            it.type(RegistryType.RESOURCE)
            it.typeName(resourceType)
        }.schema()
        val file = File("$resourceType.json")
        file.writeText(schema)
        file
    }

    val resourceTypesInUse: MutableSet<String> = mutableSetOf()
    fun addResourceSchemaMapping(
        project: Project,
        file: DynamicResourceVirtualFile
    ) {
        val configuration = JsonSchemaMappingsProjectConfiguration.getInstance(project).findMappingForFile(file)
        if (configuration == null) {
            resourceTypesInUse.add(file.getResourceIdentifier().resourceType)
            JsonSchemaService.Impl.get(project).reset()
            JsonSchemaServiceImpl(project).reset()
        }
    }
}

data class ResourceDetails(val operations: List<Operation>, val arnRegex: String? = null)

enum class Operation {
    CREATE, READ, UPDATE, DELETE, LIST;
}

data class DynamicResourceIdentifier(val connectionSettings: ConnectionSettings, val resourceType: String, val resourceIdentifier: String)
