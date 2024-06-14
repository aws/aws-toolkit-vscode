// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.openapi.actionSystem.ActionPromoter
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.actionSystem.EditorAction
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.handlers.CodeWhispererPopupLeftArrowHandler
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.handlers.CodeWhispererPopupRightArrowHandler
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.handlers.CodeWhispererPopupTabHandler

class CodeWhispererActionPromoter : ActionPromoter {
    override fun promote(actions: MutableList<out AnAction>, context: DataContext): MutableList<AnAction> {
        val results = actions.toMutableList()
        results.sortWith { a, b ->
            if (isCodeWhispererPopupAction(a)) {
                return@sortWith -1
            } else if (isCodeWhispererPopupAction(b)) {
                return@sortWith 1
            } else {
                0
            }
        }
        return results
    }

    private fun isCodeWhispererAcceptAction(action: AnAction): Boolean =
        action is EditorAction && action.handler is CodeWhispererPopupTabHandler

    private fun isCodeWhispererNavigateAction(action: AnAction): Boolean =
        action is EditorAction && (
            action.handler is CodeWhispererPopupRightArrowHandler ||
                action.handler is CodeWhispererPopupLeftArrowHandler
            )

    private fun isCodeWhispererPopupAction(action: AnAction): Boolean =
        isCodeWhispererAcceptAction(action) || isCodeWhispererNavigateAction(action)
}
