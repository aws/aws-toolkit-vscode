// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.explorer.actions.AnActionTreeNode
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import software.aws.toolkits.jetbrains.services.amazonq.isQSupportedInThisVersion
import software.aws.toolkits.jetbrains.services.codemodernizer.explorer.nodes.CodeModernizerRunModernizeNode
import software.aws.toolkits.jetbrains.services.codemodernizer.isCodeModernizerAvailable
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message

class CwQTreeRootNode(private val nodeProject: Project) : AbstractTreeNode<Any>(nodeProject, Object()) {
    private val runCodeModernizerNode by lazy { CodeModernizerRunModernizeNode(nodeProject) }

    override fun update(presentation: PresentationData) {}

    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)

        val groupId = when (connection) {
            is ActiveConnection.NotConnected -> if (otherActiveIdentityConnectionsAvailable()) ENABLE_Q_ACTION_GROUP else Q_SIGNED_OUT_ACTION_GROUP
            is ActiveConnection.ValidBearer -> Q_SIGNED_IN_ACTION_GROUP
            else -> Q_EXPIRED_TOKEN_ACTION_GROUP
        }

        val actions = ActionManager.getInstance().getAction(groupId) as ActionGroup
        val childNodes = actions.getChildren(null).mapNotNull {
            object : AnActionTreeNode(project, ToolkitPlaces.CWQ_TOOL_WINDOW, it) {
                override fun update(presentation: PresentationData) {
                    super.update(presentation)

                    // We only want to display not supported info in the "Open Chat Panel" node not the migration node
                    if (presentation.coloredText[0].text != message("action.q.openchat.text")) return

                    if (groupId == Q_SIGNED_IN_ACTION_GROUP) {
                        if (isRunningOnRemoteBackend()) {
                            presentation.addText(message("codewhisperer.explorer.root_node.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
                        } else if (!isQSupportedInThisVersion()) {
                            presentation.addText(message("q.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
                        }
                    }
                }
            }
        }

        // Temporarily put the transform node in the panel(as the second node before the migration node), to be removed soon.
        if (groupId == Q_SIGNED_IN_ACTION_GROUP && isCodeModernizerAvailable(project)) {
            return listOf(childNodes[0], runCodeModernizerNode, childNodes[1])
        }

        return childNodes
    }

    private fun otherActiveIdentityConnectionsAvailable() =
        ToolkitAuthManager.getInstance().listConnections().filterIsInstance<AwsBearerTokenConnection>().isNotEmpty()

    companion object {
        const val Q_SIGNED_IN_ACTION_GROUP = "aws.toolkit.q.idc.signed.in"
        const val Q_SIGNED_OUT_ACTION_GROUP = "aws.toolkit.q.sign.in"
        const val Q_EXPIRED_TOKEN_ACTION_GROUP = "aws.toolkit.q.expired"
        const val ENABLE_Q_ACTION_GROUP = "aws.toolkit.q.enable"
    }
}
