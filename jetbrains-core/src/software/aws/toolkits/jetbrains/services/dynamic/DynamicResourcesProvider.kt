// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.ProvisioningType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import kotlin.coroutines.coroutineContext

class DynamicResourcesProvider(private val cfnClient: CloudFormationClient) {
    suspend fun listSupportedTypes(): List<ResourceType> = withContext(coroutineContext) {
        val mutable = async {
            cfnClient.listTypesPaginator {
                it.visibility(Visibility.PUBLIC)
                it.provisioningType(ProvisioningType.FULLY_MUTABLE)
            }
        }

        val immutable = async {
            cfnClient.listTypesPaginator {
                it.visibility(Visibility.PUBLIC)
                it.provisioningType(ProvisioningType.IMMUTABLE)
            }
        }
        val types = mutable.await() + immutable.await()

        types.flatMap { resp ->
            resp.typeSummaries().map { summary ->
                typeFromName(summary.typeName())
            }
        }
    }

    fun listResources(type: ResourceType): List<DynamicResource> {
        return cfnClient.listResourcesPaginator {
            it.typeName(type.fullName)
        }.flatMap { it.resourceDescriptions().map { resource -> DynamicResource(resource.identifier(), resource.resourceModel()) } }
    }

    fun getSchemaForResource(type: ResourceType) {

    }

    private fun typeFromName(typeName: String): ResourceType {
        val (_, svc, type) = typeName.split("::")
        return ResourceType(typeName, svc, type)
    }
}

data class ResourceType(val fullName: String, val service: String, val name: String)
data class DynamicResource(val identifier: String, val model: String)
