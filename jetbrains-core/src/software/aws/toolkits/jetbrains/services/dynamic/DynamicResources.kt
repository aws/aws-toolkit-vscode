// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope

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

    fun listTypesInCurrentRegion(): Resource.Cached<List<String>> = ClientBackedCachedResource(
        CloudFormationClient::class, "cloudformation.dynamic.resources.in.current.region"
    ) {
        getResourcesForCurrentRegion(this@ClientBackedCachedResource)
    }

    private fun getResourcesForCurrentRegion(cfnClient: CloudFormationClient): List<String> =
        cfnClient.listTypesPaginator {
            it.visibility(Visibility.PUBLIC)
            it.type(RegistryType.RESOURCE)
        }.flatMap { it.typeSummaries().map { it.typeName() } }

    override fun dispose() {}
}
