// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope

object DynamicResources {
    private val coroutineScope = ApplicationThreadPoolScope("DynamicResources")
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

    fun listTypesInCurrentRegion(): Resource.Cached<List<String>> = ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.in.current.region") {
        listabc(this@ClientBackedCachedResource)
    }

    fun listabc(cfnClient: CloudFormationClient) :List<String> {
        val a = cfnClient.listTypesPaginator {
            it.visibility(Visibility.PUBLIC)
            it.type(RegistryType.RESOURCE)
        }.flatMap { it.typeSummaries().map { it.typeName() }  }
        println("hello listabc " + a.size)
        return a
    }

    suspend fun resourceAvailableInCurrentRegion(project: Project, resourceName: String): Boolean =
        withContext(coroutineScope.coroutineContext) {
            println(resourceName)
            val abc = mutableListOf<String>()
            project.awsClient<CloudFormationClient>().listTypesPaginator {
                it.visibility(Visibility.PUBLIC)
                it.type(RegistryType.RESOURCE)
            }.iterator().forEach { it1 -> abc += it1.typeSummaries().map { it.typeName() } }
            println(abc)
            resourceName in abc
        }


}
