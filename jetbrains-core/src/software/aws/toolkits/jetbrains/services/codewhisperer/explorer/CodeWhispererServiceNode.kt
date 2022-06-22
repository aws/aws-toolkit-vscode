// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.icons.AllIcons
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.ActionGroupOnRightClick
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_ENABLE_CODEWHISPERER
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_ENTER_ACCESSTOKEN
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_OPEN_CODE_REFERENCE_PANEL
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_PAUSE_CODEWHISPERER
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_REQUEST_ACCESSTOKEN
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_RESUME_CODEWHISPERER
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_RUN_SECURITY_SCAN
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager.Companion.ACTION_WHAT_IS_CODEWHISPERER
import software.aws.toolkits.resources.message
import javax.swing.Icon

class CodeWhispererServiceNode(
    project: Project,
    value: String,
) : AbstractActionTreeNode(project, value, null), ActionGroupOnRightClick {
    private val nodeProject
        get() = myProject
    private val pauseCodeWhispererNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.pause_auto"),
            ACTION_PAUSE_CODEWHISPERER,
            1,
            AllIcons.Actions.Pause
        )
    }
    private val resumeCodeWhispererNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.resume_auto"),
            ACTION_RESUME_CODEWHISPERER,
            1,
            AllIcons.Actions.Resume
        )
    }
    private val whatIsCodeWhispererNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.what_is"),
            ACTION_WHAT_IS_CODEWHISPERER,
            0,
            AllIcons.Actions.Help
        )
    }
    private val enableCodeWhispererNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.enable"),
            ACTION_ENABLE_CODEWHISPERER,
            1,
            AllIcons.Actions.Execute
        )
    }
    private val openCodeReferenceNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.code_reference.open"),
            ACTION_OPEN_CODE_REFERENCE_PANEL,
            3,
            AllIcons.Actions.Preview
        )
    }
    private val runCodeScanNode by lazy {
        CodeWhispererActionNode(
            nodeProject, message("codewhisperer.codescan.run_scan"),
            ACTION_RUN_SECURITY_SCAN,
            2,
            CodeWhispererCodeScanManager.getInstance(nodeProject).getActionButtonIcon()
        )
    }
    private val requestAccessTokenNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.token.request"),
            ACTION_REQUEST_ACCESSTOKEN,
            4,
            AllIcons.General.User
        )
    }
    private val enterAccessTokenNode by lazy {
        CodeWhispererActionNode(
            nodeProject,
            message("codewhisperer.explorer.token.dialog_title"),
            ACTION_ENTER_ACCESSTOKEN,
            5,
            AllIcons.Actions.Edit
        )
    }

    override fun onDoubleClick() {}

    override fun getChildren(): Collection<AbstractTreeNode<*>> {
        val codewhispererActions = mutableListOf<CodeWhispererActionNode>()
        val manager = CodeWhispererExplorerActionManager.getInstance()
        if (!manager.isAuthorized()) {
            codewhispererActions.add(whatIsCodeWhispererNode)
            codewhispererActions.add(requestAccessTokenNode)
            codewhispererActions.add(enterAccessTokenNode)
        } else {
            if (!manager.hasAcceptedTermsOfService()) {
                codewhispererActions.add(whatIsCodeWhispererNode)
                codewhispererActions.add(enableCodeWhispererNode)
            } else {
                if (manager.isAutoEnabled()) {
                    codewhispererActions.add(pauseCodeWhispererNode)
                } else {
                    codewhispererActions.add(resumeCodeWhispererNode)
                }
                codewhispererActions.add(runCodeScanNode)
                codewhispererActions.add(openCodeReferenceNode)
            }
        }
        return codewhispererActions
    }

    override fun actionGroupName(): String = "aws.toolkit.explorer.codewhisperer"
}

class CodeWhispererActionNode(
    project: Project,
    actionName: String,
    private val actionId: String,
    val order: Int,
    icon: Icon
) : AbstractActionTreeNode(
    project,
    actionName,
    icon
) {
    private val nodeProject
        get() = myProject

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun onDoubleClick() {
        CodeWhispererExplorerActionManager.getInstance().performAction(nodeProject, actionId)
    }
}
