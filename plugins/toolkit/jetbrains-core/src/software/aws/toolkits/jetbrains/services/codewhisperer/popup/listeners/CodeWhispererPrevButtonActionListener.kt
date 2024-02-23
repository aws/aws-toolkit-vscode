// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.popup.listeners

import com.intellij.openapi.application.ApplicationManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import java.awt.event.ActionEvent

class CodeWhispererPrevButtonActionListener(states: InvocationContext) : CodeWhispererActionListener(states) {
    override fun actionPerformed(e: ActionEvent?) {
        ApplicationManager.getApplication().messageBus.syncPublisher(
            CodeWhispererPopupManager.CODEWHISPERER_USER_ACTION_PERFORMED
        ).navigatePrevious(states)
    }
}
