// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.arns.Arn
import software.amazon.awssdk.services.cloudcontrol.CloudControlClient
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.RegistryType
import software.amazon.awssdk.services.cloudformation.model.Visibility
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources

object CloudControlApiResources {
    fun listResources(typeName: String): Resource<List<DynamicResource>> =
        when (typeName) {
            S3_BUCKET -> S3Resources.LIST_BUCKETS.map { it.name() }
            else -> ClientBackedCachedResource(CloudControlClient::class, "cloudcontrolapi.dynamic.resources.$typeName") {
                this.listResourcesPaginator { req -> req.typeName(typeName) }
                    .flatMap { page -> page.resourceDescriptions().map { it.identifier() } }
            }
        }.map { DynamicResource(resourceTypeFromResourceTypeName(typeName), it) }

    fun resourceTypeFromResourceTypeName(typeName: String): ResourceType {
        val (_, svc, type) = typeName.split("::")
        return ResourceType(typeName, svc, type)
    }

    fun listResources(resourceType: ResourceType): Resource<List<DynamicResource>> = listResources(resourceType.fullName)

    fun getResourceDisplayName(identifier: String): String =
        if (identifier.startsWith("arn:")) {
            Arn.fromString(identifier).resourceAsString()
        } else {
            identifier
        }

    fun getResourceSchema(resourceType: String): Resource.Cached<VirtualFile> =
        ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.dynamic.resources.schema.$resourceType") {
            val schema = this.describeType {
                it.type(RegistryType.RESOURCE)
                it.typeName(resourceType)
            }.schema()
            LightVirtualFile("${resourceType}Schema.json", schema)
        }

    fun listTypes(): Resource.Cached<List<String>> = ClientBackedCachedResource(CloudFormationClient::class, "cloudformation.listTypes") {
        this.listTypesPaginator {
            it.visibility(Visibility.PUBLIC)
            it.type(RegistryType.RESOURCE)
        }.flatMap { it.typeSummaries().map { it.typeName() } }
    }
    private const val S3_BUCKET = "AWS::S3::Bucket"
}

data class ResourceDetails(val operations: List<PermittedOperation>, val arnRegex: String?, val documentation: String?)

enum class PermittedOperation {
    CREATE, READ, UPDATE, DELETE, LIST
}
