// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.text.DateTimeFormatManager
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.ActionGroupOnRightClick
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.PinnedConnectionNode
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.CodeWhispererReconnectNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.FreeTierUsageLimitHitNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.GetStartedNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.LearnCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.OpenCodeReferenceNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.PauseCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.ResumeCodeWhispererNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.RunCodeScanNode
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes.WhatIsCodeWhispererNode
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
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
    private val codeWhispererReconnectNode by lazy { CodeWhispererReconnectNode(nodeProject) }
    private val freeTierUsageLimitHitNode by lazy {
        // we should probably build the text dynamically in case the format setting changes,
        // but that shouldn't happen often enough for us to care
        val formatter = tryOrNull {
            DateTimeFormatter.ofPattern(DateTimeFormatManager.getInstance().dateFormatPattern)
        } ?: DateTimeFormatter.ofPattern(DateTimeFormatManager.DEFAULT_DATE_FORMAT)
        val date = LocalDate.now().with(TemporalAdjusters.firstDayOfNextMonth())

        FreeTierUsageLimitHitNode(nodeProject, formatter.format(date))
    }
    private val learnCodeWhispererNode by lazy { LearnCodeWhispererNode(nodeProject) }

    override fun onDoubleClick(event: MouseEvent) {}

    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        if (isRunningOnRemoteBackend()) {
            return emptyList()
        }

        val manager = CodeWhispererExplorerActionManager.getInstance()
        val activeConnectionType = manager.checkActiveCodeWhispererConnectionType(project)

        return when (activeConnectionType) {
            CodeWhispererLoginType.Logout -> listOf(whatIsCodeWhispererNode, getStartedCodeWhispererNode)
            CodeWhispererLoginType.Expired -> listOf(codeWhispererReconnectNode, whatIsCodeWhispererNode)

            else -> {
                if (manager.isSuspended(nodeProject)) {
                    listOf(freeTierUsageLimitHitNode, runCodeScanNode, openCodeReferenceNode)
                } else if (manager.isAutoEnabled()) {
                    listOf(pauseCodeWhispererNode, runCodeScanNode, openCodeReferenceNode, learnCodeWhispererNode)
                } else {
                    listOf(resumeCodeWhispererNode, runCodeScanNode, openCodeReferenceNode, learnCodeWhispererNode)
                }
            }
        }
    }

    override fun update(presentation: PresentationData) {
        super.update(presentation)
        if (isRunningOnRemoteBackend()) {
            presentation.addText(message("codewhisperer.explorer.root_node.unavailable"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            return
        }

        val connectionType = CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project)
        when (connectionType) {
            CodeWhispererLoginType.Expired -> {
                presentation.addText(message("codewhisperer.explorer.root_node.login_type.expired"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            }

            CodeWhispererLoginType.Accountless -> {
                presentation.addText(message("codewhisperer.explorer.root_node.login_type.accountless"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            }

            CodeWhispererLoginType.SSO -> {
                presentation.addText(message("codewhisperer.explorer.root_node.login_type.sso"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            }

            CodeWhispererLoginType.Sono -> {
                presentation.addText(message("codewhisperer.explorer.root_node.login_type.aws_builder_id"), SimpleTextAttributes.GRAY_ATTRIBUTES)
            }
            else -> {}
        }
    }

    override fun actionGroupName(): String = "aws.toolkit.explorer.codewhisperer"

    override fun feature() = CodeWhispererConnection.getInstance()
}
