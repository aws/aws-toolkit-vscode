// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.openapi.editor.Editor
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererTriggerType

interface CodeWhispererAutoTriggerHandler {
    fun performAutomatedTriggerAction(
        editor: Editor,
        automatedTriggerType: CodewhispererAutomatedTriggerType,
        latencyContext: LatencyContext
    ) {
        val triggerTypeInfo = TriggerTypeInfo(CodewhispererTriggerType.AutoTrigger, automatedTriggerType)
        CodeWhispererService.getInstance().showRecommendationsInPopup(editor, triggerTypeInfo, latencyContext)
    }
}
