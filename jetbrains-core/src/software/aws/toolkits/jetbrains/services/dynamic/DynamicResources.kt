// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
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
            val resourceStream = DynamicResources.javaClass.getResourceAsStream("/cloudapi/dynamic_resources.json")
                ?: throw RuntimeException("dynamic resource manifest not found")
            val jsonTree = reader.readTree(resourceStream)

            jsonTree
                .fieldNames()
                .asSequence()
                .toList()
        }

    fun listResources(typeName: String): Resource.Cached<List<DynamicResource>> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.$typeName") {
            DynamicResourcesProvider(this@ClientBackedCachedResource).listResources(typeName)
        }

    fun listResources(resourceType: ResourceType): Resource.Cached<List<DynamicResource>> = listResources(resourceType.fullName)

    override fun dispose() {}

    fun getResourceDisplayName(identifier: String) : String =
        if (identifier.startsWith("arn:")) {
            Arn.fromString(identifier).resourceAsString()
        } else {
            identifier
        }

    fun getResourceSchema(project: Project, resourceType: String): Resource.Cached<File> = ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.schema.$resourceType"){
        val client = project.awsClient<CloudFormationClient>()
        val schema = client.describeType{
            it.type(RegistryType.RESOURCE)
            it.typeName(resourceType)
        }.schema()
        val file = File("$resourceType.json")
        file.writeText(schema)
        file
    }

    val resourceTypesInUse : MutableSet<String> = mutableSetOf()
}

data class DynamicResourceIdentifier(val connectionSettings: ConnectionSettings, val resourceType: String, val resourceIdentifier: String)
