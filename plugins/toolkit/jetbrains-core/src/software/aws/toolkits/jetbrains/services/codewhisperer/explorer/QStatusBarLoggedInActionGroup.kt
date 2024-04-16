// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.actions.SsoLogoutAction
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererConnectOnGithubAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererProvideFeedbackAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererShowSettingsAction
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.ActionProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Customize
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Learn
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.OpenCodeReference
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Pause
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.PauseCodeScans
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Resume
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.ResumeCodeScans
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.buildActionListForCodeScan
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.buildActionListForConnectHelp
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.buildActionListForInlineSuggestions
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.buildActionListForOtherFeatures
import software.aws.toolkits.resources.message

class QStatusBarLoggedInActionGroup : DefaultActionGroup() {
    private val actionProvider = object : ActionProvider<AnAction> {
        override val pause = Pause()
        override val resume = Resume()
        override val openCodeReference = OpenCodeReference()
        override val customize = Customize()
        override val learn = Learn()
        override val openChatPanel = ActionManager.getInstance().getAction("q.openchat")
        override val runScan = ActionManager.getInstance().getAction("codewhisperer.toolbar.security.scan")
        override val stopScan = ActionManager.getInstance().getAction("codewhisperer.toolbar.security.stopscan")
        override val pauseAutoScans = PauseCodeScans()
        override val resumeAutoScans = ResumeCodeScans()
        override val sendFeedback = CodeWhispererProvideFeedbackAction()
        override val connectOnGithub = CodeWhispererConnectOnGithubAction()
        override val documentation = CodeWhispererLearnMoreAction()
    }

    override fun getChildren(e: AnActionEvent?) = e?.project?.let {
        buildList {
            add(Separator.create())
            add(Separator.create(message("codewhisperer.statusbar.sub_menu.inline.title")))
            addAll(buildActionListForInlineSuggestions(it, actionProvider))

            add(Separator.create())
            add(Separator.create(message("codewhisperer.statusbar.sub_menu.security_scans.title")))
            addAll(buildActionListForCodeScan(it, actionProvider))

            add(Separator.create())
            add(Separator.create(message("codewhisperer.statusbar.sub_menu.other_features.title")))
            addAll(buildActionListForOtherFeatures(actionProvider))

            add(Separator.create())
            add(Separator.create(message("codewhisperer.statusbar.sub_menu.connect_help.title")))
            addAll(buildActionListForConnectHelp(actionProvider))

            add(Separator.create())
            add(CodeWhispererShowSettingsAction())
            ToolkitConnectionManager.getInstance(it).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let { c ->
                (c as? AwsBearerTokenConnection)?.let { connection ->
                    add(SsoLogoutAction(connection))
                }
            }
        }.toTypedArray()
    }.orEmpty()
}
