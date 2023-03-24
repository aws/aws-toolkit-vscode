// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes

import com.intellij.ide.DataManager
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.sono.SonoCredentialManager
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.actions.OpenWorkspaceInGateway
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

class CawsRootNode(private val nodeProject: Project) : AbstractTreeNode<String>(nodeProject, message("caws.devtoolPanel.title")), PinnedConnectionNode {
    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        val groupId = if (SonoCredentialManager.getInstance(nodeProject).hasPreviouslyConnected()) {
            "aws.caws.devtools.actions.loggedin"
        } else {
            "aws.caws.devtools.actions.loggedout"
        }

        val actions = ActionManager.getInstance().getAction(groupId) as ActionGroup
        return actions.getChildren(null).mapNotNull {
            if (it is OpenWorkspaceInGateway && isRunningOnRemoteBackend()) {
                return@mapNotNull null
            }

            object : AbstractActionTreeNode(nodeProject, it.templatePresentation.text, it.templatePresentation.icon) {
                override fun onDoubleClick(event: MouseEvent) {
                    val e = AnActionEvent.createFromInputEvent(
                        event,
                        ToolkitPlaces.DEVTOOLS_TOOL_WINDOW,
                        it.templatePresentation.clone(),
                        DataManager.getInstance().getDataContext(event.component)
                    )

                    it.actionPerformed(e)
                }
            }
        }
    }

    override fun update(presentation: PresentationData) {
        presentation.addText(value, SimpleTextAttributes.REGULAR_ATTRIBUTES)

        with(ConnectionPinningManager.getInstance(project)) {
            if (isFeaturePinned(CodeCatalystConnection.getInstance())) {
                presentation.addText(message("caws.connected.builder_id"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            }
        }
    }

    override fun feature() = CodeCatalystConnection.getInstance()
}

class CawsServiceNode : DevToolsServiceNode {
    override val serviceId: String = "aws.toolkit.caws.service"
    override fun buildServiceRootNode(nodeProject: Project): AbstractTreeNode<*> = CawsRootNode(nodeProject)
}
