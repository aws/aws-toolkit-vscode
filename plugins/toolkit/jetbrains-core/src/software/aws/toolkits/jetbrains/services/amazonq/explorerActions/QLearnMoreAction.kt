// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.explorerActions

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry

class QLearnMoreAction : AnAction(message("q.learn.more"), "", AllIcons.Actions.Help) {
    override fun actionPerformed(e: AnActionEvent) {
        UiTelemetry.click(e.project, "q_learnMore")
        BrowserUtil.browse("https://aws.amazon.com/q")
    }
}
