// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.codeInsight.lookup.Lookup
import com.intellij.codeInsight.lookup.LookupEvent
import com.intellij.codeInsight.lookup.LookupListener
import com.intellij.codeInsight.lookup.LookupManagerListener
import com.intellij.codeInsight.lookup.impl.LookupImpl
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutoTriggerService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType

object CodeWhispererIntelliSenseAutoTriggerListener : LookupManagerListener {
    override fun activeLookupChanged(oldLookup: Lookup?, newLookup: Lookup?) {
        if (oldLookup != null || newLookup == null) return

        newLookup.addLookupListener(object : LookupListener {
            override fun itemSelected(event: LookupEvent) {
                val editor = event.lookup.editor
                if (!(event.lookup as LookupImpl).isShown) {
                    cleanup()
                    return
                }

                // Classifier
                CodeWhispererAutoTriggerService.getInstance().tryInvokeAutoTrigger(editor, CodeWhispererAutomatedTriggerType.IntelliSense())
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
