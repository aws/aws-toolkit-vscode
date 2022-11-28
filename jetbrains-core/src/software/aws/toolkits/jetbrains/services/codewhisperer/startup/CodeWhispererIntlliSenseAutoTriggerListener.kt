// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.codeInsight.lookup.Lookup
import com.intellij.codeInsight.lookup.LookupEvent
import com.intellij.codeInsight.lookup.LookupListener
import com.intellij.codeInsight.lookup.LookupManagerListener
import com.intellij.codeInsight.lookup.impl.LookupImpl
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererTriggerType

object CodeWhispererIntlliSenseAutoTriggerListener : LookupManagerListener {
    override fun activeLookupChanged(oldLookup: Lookup?, newLookup: Lookup?) {
        if (oldLookup != null || newLookup == null) return

        newLookup.addLookupListener(object : LookupListener {
            override fun itemSelected(event: LookupEvent) {
                val editor = event.lookup.editor
                val triggerType = CodewhispererTriggerType.AutoTrigger
                if (!(event.lookup as LookupImpl).isShown ||
                    !CodeWhispererService.getInstance().canDoInvocation(editor, triggerType)
                ) {
                    cleanup()
                    return
                }
                val triggerTypeInfo = TriggerTypeInfo(
                    triggerType,
                    CodewhispererAutomatedTriggerType.IntelliSenseAcceptance
                )
                CodeWhispererService.getInstance().showRecommendationsInPopup(editor, triggerTypeInfo)
                cleanup()
            }
            override fun lookupCanceled(event: LookupEvent) {
                cleanup()
            }

            private fun cleanup() {
                newLookup.removeLookupListener(this)
            }
        })
    }
}
