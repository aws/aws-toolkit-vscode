// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab.nodes

import com.intellij.icons.AllIcons
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.explorer.actions.AnActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.PinnedConnectionNode
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import software.aws.toolkits.jetbrains.services.amazonq.isQSupportedInThisVersion
import software.aws.toolkits.jetbrains.services.codemodernizer.explorer.nodes.CodeModernizerRunModernizeNode
import software.aws.toolkits.jetbrains.services.codemodernizer.isCodeModernizerAvailable
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.OpenCodeReferenceNode
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message

class QServiceNode : CwQServiceNode {
    override val serviceId: String = "aws.toolkit.q.service"

    override fun buildServiceRootNode(nodeProject: Project): AbstractTreeNode<*> = QRootNode(nodeProject)

    companion object {
        val NODE_NAME = message("q.node.title")
    }
}

class QRootNode(private val nodeProject: Project) : AbstractTreeNode<String>(nodeProject, QServiceNode.NODE_NAME), PinnedConnectionNode {
    private val runCodeModernizerNode by lazy { CodeModernizerRunModernizeNode(nodeProject) }

    override fun update(presentation: PresentationData) {
        presentation.addText(value, SimpleTextAttributes.REGULAR_ATTRIBUTES)
        if (isRunningOnRemoteBackend()) {
            presentation.addText(message("codewhisperer.explorer.root_node.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            return
        }
        if (!isQSupportedInThisVersion()) {
            presentation.addText(message("q.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
        }
    }

    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        if (isRunningOnRemoteBackend()) return emptyList()
        val actionManager = ActionManager.getInstance().getAction("q.not.supported") as ActionGroup
        val notSupportedNode = actionManager.getChildren(null).mapNotNull {
            AnActionTreeNode(project, ToolkitPlaces.CWQ_TOOL_WINDOW, it)
        }
        if (!isQSupportedInThisVersion()) return notSupportedNode
        val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)

        val groupId = when (connection) {
            is ActiveConnection.NotConnected -> if (otherActiveIdentityConnectionsAvailable()) ENABLE_Q_ACTION_GROUP else Q_SIGNED_OUT_ACTION_GROUP
            is ActiveConnection.ValidBearer -> Q_SIGNED_IN_ACTION_GROUP
            else -> Q_EXPIRED_TOKEN_ACTION_GROUP
        }

        val actions = ActionManager.getInstance().getAction(groupId) as ActionGroup
        val childNodes = actions.getChildren(null).mapNotNull {
            AnActionTreeNode(project, ToolkitPlaces.CWQ_TOOL_WINDOW, it)
        }
        return if (groupId == Q_SIGNED_IN_ACTION_GROUP) {
            val signedInNodes = childNodes + OpenCodeReferenceNode(nodeProject)
            if (connection.connectionType == ActiveConnectionType.IAM_IDC && isCodeModernizerAvailable(project)) {
                signedInNodes + runCodeModernizerNode
            } else {
                signedInNodes
            }
        } else {
            childNodes
        }
    }

    override fun feature(): FeatureWithPinnedConnection = QConnection.getInstance()

    private fun otherActiveIdentityConnectionsAvailable() =
        ToolkitAuthManager.getInstance().listConnections().filterIsInstance<AwsBearerTokenConnection>().isNotEmpty()

    companion object {
        const val Q_SIGNED_IN_ACTION_GROUP = "aws.toolkit.q.idc.signed.in"
        const val Q_SIGNED_OUT_ACTION_GROUP = "aws.toolkit.q.sign.in"
        const val Q_EXPIRED_TOKEN_ACTION_GROUP = "aws.toolkit.q.expired"
        const val ENABLE_Q_ACTION_GROUP = "aws.toolkit.q.enable"
    }
}

class QNotSupportedNode : AnAction(message("q.unavailable.node"), "", AllIcons.General.Warning) {
    override fun actionPerformed(e: AnActionEvent) {}
}
