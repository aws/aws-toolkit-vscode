// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.schemas.SchemasClient
import software.amazon.awssdk.services.schemas.model.RegistrySummary
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CacheBackedAwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.resources.message

class SchemasServiceNode(project: Project, service: AwsExplorerServiceNode) :
    CacheBackedAwsExplorerServiceRootNode<RegistrySummary>(project, service, SchemasResources.LIST_REGISTRIES) {
    override fun toNode(child: RegistrySummary): AwsExplorerNode<*> = SchemaRegistryNode(nodeProject, child)
}

open class SchemaRegistryNode(
    project: Project,
    val registry: RegistrySummary
) : AwsExplorerResourceNode<RegistrySummary>(
    project,
    SchemasClient.SERVICE_NAME,
    registry,
    AwsIcons.Resources.SCHEMA_REGISTRY
), ResourceParentNode {
    override fun resourceType() = "registry"

    override fun resourceArn(): String = value.registryArn() ?: value.registryName()

    override fun toString(): String = value.registryName()

    override fun displayName(): String = value.registryName()

    override fun isAlwaysLeaf(): Boolean = false

    override fun isAlwaysShowPlus(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = super<ResourceParentNode>.getChildren()

    override fun getChildrenInternal(): List<AwsExplorerNode<*>> {
        val resourceCache = AwsResourceCache.getInstance(nodeProject)
        val registryName = value.registryName()
        return resourceCache
            .getResourceNow(SchemasResources.listSchemas(registryName))
            .map { schema -> SchemaNode(nodeProject, schema.toDataClass(registryName)) }
            .toList()
    }

    override fun emptyChildrenNode(): AwsExplorerEmptyNode = AwsExplorerEmptyNode(
        nodeProject,
        message("explorer.registry.no.schema.resources")
    )
}

open class SchemaNode(
    project: Project,
    val schema: Schema
) : AwsExplorerResourceNode<Schema>(
    project,
    SchemasClient.SERVICE_NAME,
    schema,
    AwsIcons.Resources.SCHEMA
) {
    override fun resourceType() = "schema"

    override fun resourceArn() = value.arn ?: value.name

    override fun toString(): String = value.name

    override fun displayName() = value.name
}
