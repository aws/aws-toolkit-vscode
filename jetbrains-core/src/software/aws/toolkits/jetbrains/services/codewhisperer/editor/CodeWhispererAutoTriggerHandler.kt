// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.openapi.editor.Editor
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererTriggerType

interface CodeWhispererAutoTriggerHandler {
    fun performAutomatedTriggerAction(editor: Editor, automatedTriggerType: CodewhispererAutomatedTriggerType) {
        if (automatedTriggerType == CodewhispererAutomatedTriggerType.KeyStrokeCount &&
            !CodeWhispererInvocationStatus.getInstance().hasMetInvocationTimeThreshold()
        ) {
            LOG.debug { "Attempt to auto-trigger CodeWhisperer but haven't reached time threshold since last invocation." }
            return
        }
        val triggerTypeInfo = TriggerTypeInfo(CodewhispererTriggerType.AutoTrigger, automatedTriggerType)
        CodeWhispererService.getInstance().showRecommendationsInPopup(editor, triggerTypeInfo)
    }

    companion object {
        private val LOG = getLogger<CodeWhispererAutoTriggerHandler>()
    }
}
