// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.ui.EditorNotifications
import software.amazon.awssdk.services.cloudcontrol.model.UnsupportedActionException
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceActionNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.dynamic.CloudControlApiResources
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceIdentifier
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager.Companion.isTerminal
import software.aws.toolkits.jetbrains.services.dynamic.OpenViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DynamicresourceTelemetry
import software.aws.toolkits.telemetry.Result

class DynamicResourceResourceTypeNode(project: Project, val resourceType: String) :
    AwsExplorerNode<String>(project, resourceType, null),
    ResourceParentNode,
    ResourceActionNode {

    override fun displayName(): String = resourceType
    override fun isAlwaysShowPlus(): Boolean = true

    // calls to CloudAPI time-expensive and likely to throttle
    override fun isAlwaysExpand(): Boolean = false

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()

    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = try {
        nodeProject.getResourceNow(CloudControlApiResources.listResources(resourceType))
            .map { DynamicResourceNode(nodeProject, it) }
            .also { DynamicresourceTelemetry.listResource(project = nodeProject, success = true, resourceType = resourceType) }
    } catch (e: Exception) {
        when (e) {
            is UnsupportedActionException -> {
                DynamicresourceTelemetry.listResource(project = nodeProject, result = Result.Cancelled, resourceType = resourceType)
                listOf(AwsExplorerEmptyNode(nodeProject, message("dynamic_resources.unavailable_in_region", region.id)))
            }
            else -> {
                DynamicresourceTelemetry.listResource(project = nodeProject, success = false, resourceType = resourceType)
                throw e
            }
        }
    }

    override fun actionGroupName(): String = "aws.toolkit.explorer.dynamic.resource.type"
}

class UnavailableDynamicResourceTypeNode(project: Project, resourceType: String) : AwsExplorerNode<String>(project, resourceType, null) {
    override fun statusText(): String = message("dynamic_resources.unavailable_in_region", region.id)
    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()
    override fun isAlwaysLeaf(): Boolean = true
}

class DynamicResourceNode(project: Project, val resource: DynamicResource) :
    AwsExplorerNode<DynamicResource>(project, resource, null),
    ResourceActionNode {

    override fun actionGroupName() = "aws.toolkit.explorer.dynamic.resource"
    override fun displayName(): String = CloudControlApiResources.getResourceDisplayName(resource.identifier)

    override fun statusText(): String? {
        val state = DynamicResourceUpdateManager.getInstance(nodeProject)
            .getUpdateStatus(DynamicResourceIdentifier(nodeProject.getConnectionSettingsOrThrow(), resource.type.fullName, resource.identifier))?.takeIf {
                !it.status.isTerminal()
            }
            ?: return null
        return "${state.operation} ${state.status}"
    }

    override fun isAlwaysShowPlus(): Boolean = false
    override fun isAlwaysLeaf(): Boolean = true
    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()
    override fun onDoubleClick() = openResourceModelInEditor(OpenResourceModelSourceAction.READ)

    fun openResourceModelInEditor(sourceAction: OpenResourceModelSourceAction) {
        val dynamicResourceIdentifier = DynamicResourceIdentifier(nodeProject.getConnectionSettingsOrThrow(), resource.type.fullName, resource.identifier)
        val openFiles = FileEditorManager.getInstance(nodeProject).openFiles.filter {
            it is ViewEditableDynamicResourceVirtualFile && it.dynamicResourceIdentifier == dynamicResourceIdentifier
        }
        if (openFiles.isEmpty()) {
            object : Task.Backgroundable(nodeProject, message("dynamic_resources.fetch.indicator_title", resource.identifier), true) {
                override fun run(indicator: ProgressIndicator) {
                    indicator.text = message("dynamic_resources.fetch.fetch")
                    val model = OpenViewEditableDynamicResourceVirtualFile.getResourceModel(
                        nodeProject,
                        nodeProject.awsClient(),
                        resource.type.fullName,
                        resource.identifier
                    ) ?: return
                    val file = ViewEditableDynamicResourceVirtualFile(
                        dynamicResourceIdentifier,
                        model
                    )

                    indicator.text = message("dynamic_resources.fetch.open")
                    OpenViewEditableDynamicResourceVirtualFile.openFile(nodeProject, file, sourceAction, resource.type.fullName)
                }
            }.queue()
        } else {
            val openFile = openFiles.first()
            if (sourceAction == OpenResourceModelSourceAction.EDIT) {
                openFile.isWritable = true
            }
            FileEditorManager.getInstance(nodeProject).openFile(openFile, true)
            EditorNotifications.getInstance(nodeProject).updateNotifications(openFile)
        }
    }

    private companion object {
        val LOG = getLogger<DynamicResourceNode>()
    }
}

enum class OpenResourceModelSourceAction {
    READ, EDIT
}
