// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.editor.Editor
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.telemetry.CodewhispererTriggerType

interface CodeWhispererAutoTriggerHandler {
    fun performAutomatedTriggerAction(
        editor: Editor,
        automatedTriggerType: CodeWhispererAutomatedTriggerType,
        latencyContext: LatencyContext,
    ) {
        val triggerTypeInfo = TriggerTypeInfo(CodewhispererTriggerType.AutoTrigger, automatedTriggerType)

        LOG.debug { "autotriggering CodeWhisperer with type ${automatedTriggerType.telemetryType}" }
        CodeWhispererService.getInstance().showRecommendationsInPopup(editor, triggerTypeInfo, latencyContext)
    }

    companion object {
        private val LOG = getLogger<CodeWhispererAutoTriggerHandler>()
    }
}
