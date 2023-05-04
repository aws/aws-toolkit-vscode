// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererTriggerType

class CodeWhispererRecommendationAction : AnAction(message("codewhisperer.trigger.service")), DumbAware {
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && e.getData(CommonDataKeys.EDITOR) != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val latencyContext = LatencyContext()
        latencyContext.codewhispererPreprocessingStart = System.nanoTime()
        latencyContext.codewhispererEndToEndStart = System.nanoTime()
        val editor = e.getRequiredData(CommonDataKeys.EDITOR)
        if (!CodeWhispererService.getInstance().canDoInvocation(editor, CodewhispererTriggerType.OnDemand)) {
            return
        }

        val triggerType = TriggerTypeInfo(CodewhispererTriggerType.OnDemand, CodeWhispererAutomatedTriggerType.Unknown())
        CodeWhispererService.getInstance().showRecommendationsInPopup(editor, triggerType, latencyContext)
    }
}
