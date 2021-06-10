// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.json.JsonFileType
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.util.PsiUtilCore
import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.arns.Arn
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceActionNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceParentNode
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class DynamicResourceResourceTypeNode(project: Project, private val resourceType: String) :
    AwsExplorerNode<String>(project, resourceType, null),
    ResourceParentNode {
    override fun displayName(): String = resourceType
    override fun isAlwaysShowPlus(): Boolean = true

    // calls to CloudAPI time-expensive and likely to throttle
    override fun isAlwaysExpand(): Boolean = false

    override fun getChildren(): List<AwsExplorerNode<*>> = super.getChildren()
    override fun getChildrenInternal(): List<AwsExplorerNode<*>> = nodeProject.getResourceNow(DynamicResources.listResources(resourceType))
        .map { DynamicResourceNode(nodeProject, it) }
}

class DynamicResourceNode(project: Project, val resource: DynamicResource) :
    AwsExplorerNode<DynamicResource>(project, resource, null),
    ResourceActionNode {
    override fun actionGroupName() = "aws.toolkit.explorer.dynamic"
    override fun displayName(): String {
        val identifier = resource.identifier
        return if (identifier.startsWith("arn:")) {
            Arn.fromString(identifier).resourceAsString()
        } else {
            identifier
        }
    }

    override fun isAlwaysShowPlus(): Boolean = false
    override fun isAlwaysLeaf(): Boolean = true
    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()
    override fun onDoubleClick() = openResourceModelInEditor()

    fun openResourceModelInEditor() {
        object : Task.Backgroundable(nodeProject, message("dynamic_resources.fetch.indicator_title", resource.identifier), true) {
            override fun run(indicator: ProgressIndicator) {
                indicator.text = message("dynamic_resources.fetch.fetch")
                val model = try {
                    nodeProject.awsClient<CloudFormationClient>()
                        .getResource {
                            it.typeName(resource.type.fullName)
                            it.identifier(resource.identifier)
                        }
                        .resourceDescription()
                        .resourceModel()
                } catch (e: Exception) {
                    LOG.error(e) { "Failed to retrieve resource model" }
                    notifyError(
                        project = nodeProject,
                        title = message("dynamic_resources.fetch.fail.title"),
                        content = message("dynamic_resources.fetch.fail.content", resource.identifier)
                    )

                    null
                } ?: return

                val file = LightVirtualFile(
                    displayName(),
                    JsonFileType.INSTANCE,
                    model
                )

                indicator.text = message("dynamic_resources.fetch.open")
                WriteCommandAction.runWriteCommandAction(project) {
                    FileEditorManager.getInstance(nodeProject).openFile(file, true)
                    CodeStyleManager.getInstance(nodeProject).reformat(PsiUtilCore.getPsiFile(nodeProject, file))

                    file.isWritable = false

                    // editor readonly prop is separate from file prop. this is graceful if the getDocument call returns null
                    FileDocumentManager.getInstance().getDocument(file)?.setReadOnly(true)
                }
            }
        }.queue()
    }

    private companion object {
        val LOG = getLogger<DynamicResourceNode>()
    }
}
