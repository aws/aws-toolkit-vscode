// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.text.DateTimeFormatManager
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.ActionGroupOnRightClick
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.PinnedConnectionNode
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.FreeTierUsageLimitHitNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.GetStartedNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.OpenCodeReferenceNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.PauseCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.ResumeCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.RunCodeScanNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.WhatIsCodeWhispererNode
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

class CodeWhispererServiceNode(
    project: Project,
    value: String,
) : AbstractActionTreeNode(project, value, null), ActionGroupOnRightClick, PinnedConnectionNode {
    private val nodeProject
        get() = myProject
    private val pauseCodeWhispererNode by lazy { PauseCodeWhispererNode(nodeProject) }
    private val resumeCodeWhispererNode by lazy { ResumeCodeWhispererNode(nodeProject) }
    private val whatIsCodeWhispererNode by lazy { WhatIsCodeWhispererNode(nodeProject) }
    private val getStartedCodeWhispererNode by lazy { GetStartedNode(nodeProject) }
    private val openCodeReferenceNode by lazy { OpenCodeReferenceNode(nodeProject) }
    private val runCodeScanNode by lazy { RunCodeScanNode(nodeProject) }
    private val freeTierUsageLimitHitNode by lazy {
        // we should probably build the text dynamically in case the format setting changes,
        // but that shouldn't happen often enough for us to care
        val formatter = tryOrNull {
            DateTimeFormatter.ofPattern(DateTimeFormatManager.getInstance().dateFormatPattern)
        } ?: DateTimeFormatter.ofPattern(DateTimeFormatManager.DEFAULT_DATE_FORMAT)
        val date = LocalDate.now().with(TemporalAdjusters.firstDayOfNextMonth())

        FreeTierUsageLimitHitNode(nodeProject, formatter.format(date))
    }

    init {
        ApplicationManager.getApplication().messageBus.connect().subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    // TODO: Move this IF block into nullifyAccountlessCredentialIfNeeded()
                    if (newConnection is AwsBearerTokenConnection) {
                        CodeWhispererExplorerActionManager.getInstance().nullifyAccountlessCredentialIfNeeded()
                    }
                    project.refreshDevToolTree()
                }
            }
        )
    }

    override fun onDoubleClick(event: MouseEvent) {}

    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        val manager = CodeWhispererExplorerActionManager.getInstance()
        val activeConnectionType = manager.checkActiveCodeWhispererConnectionType(project)

        return when (activeConnectionType) {
            CodeWhispererLoginType.Logout -> listOf(whatIsCodeWhispererNode, getStartedCodeWhispererNode)

            else -> {
                if (manager.isSuspended(nodeProject)) {
                    listOf(freeTierUsageLimitHitNode, runCodeScanNode, openCodeReferenceNode)
                } else if (manager.isAutoEnabled()) {
                    listOf(pauseCodeWhispererNode, runCodeScanNode, openCodeReferenceNode)
                } else {
                    listOf(resumeCodeWhispererNode, runCodeScanNode, openCodeReferenceNode)
                }
            }
        }
    }

    override fun update(presentation: PresentationData) {
        super.update(presentation)
        val connectionType = CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project)
        when (connectionType) {
            CodeWhispererLoginType.Accountless -> {
                presentation.addText(message("codewhisperer.explorer.root_node.login_type.accountless"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            }

            CodeWhispererLoginType.SSO -> {
                // Only show this hint text when CodeWhisperer is using secondary connection
                if (isCodeWhispererUsingSecondaryConnection(project)) {
                    presentation.addText(message("codewhisperer.explorer.root_node.login_type.sso"), SimpleTextAttributes.GRAY_ATTRIBUTES)
                }
            }

            CodeWhispererLoginType.Sono -> {
                // Only show this hint text when CodeWhisperer is using secondary connection
                if (isCodeWhispererUsingSecondaryConnection(project)) {
                    presentation.addText(message("codewhisperer.explorer.root_node.login_type.aws_builder_id"), SimpleTextAttributes.GRAY_ATTRIBUTES)
                }
            }
            else -> {}
        }
    }

    override fun actionGroupName(): String = "aws.toolkit.explorer.codewhisperer"

    override fun feature() = CodeWhispererConnection.getInstance()
}

/**
 * return true if CodeWhisperer is used in the background otherwise false
 */
private fun isCodeWhispererUsingSecondaryConnection(project: Project) = with(ConnectionPinningManager.getInstance(project)) {
    isFeaturePinned(CodeWhispererConnection.getInstance())
}
