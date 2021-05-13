// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.json.JsonFileType
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.LightVirtualFile
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.jetbrains.services.dynamic.ResourceType

class DynamicResourceServiceNode(project: Project, private val service: String, private val resourceTypes: List<ResourceType>) :
    AwsExplorerNode<String>(project, service, null) {
    override fun displayName(): String = service
    override fun isAlwaysShowPlus(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = resourceTypes.map { DynamicResourceResourceTypeNode(nodeProject, it) }
}

class DynamicResourceResourceTypeNode(project: Project, private val resourceType: ResourceType) :
    AwsExplorerNode<String>(project, resourceType.fullName, null),
    ResourceParentNode {
    override fun displayName(): String = resourceType.name
    override fun isAlwaysShowPlus(): Boolean = true

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = nodeProject.getResourceNow(DynamicResources.listResources(resourceType))
        .map { DynamicResourceNode(nodeProject, it) }
}

class DynamicResourceNode(project: Project, private val resource: DynamicResource) :
    AwsExplorerNode<DynamicResource>(project, resource, null) {
    override fun displayName(): String = resource.identifier.substringAfterLast("/")
    override fun isAlwaysShowPlus(): Boolean = false
    override fun isAlwaysLeaf(): Boolean = true
    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun onDoubleClick() {
        FileEditorManager.getInstance(nodeProject).openFile(
            LightVirtualFile(
                displayName(),
                JsonFileType.INSTANCE,
                resource.model
            ),
            true
        )
    }
}
