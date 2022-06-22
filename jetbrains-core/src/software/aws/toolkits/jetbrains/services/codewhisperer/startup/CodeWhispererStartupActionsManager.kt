// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_ENTER
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.actionSystem.EditorActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEnterHandler

class CodeWhispererStartupActionsManager : Disposable {
    private val oldEnterHandler = EditorActionManager.getInstance().getActionHandler(ACTION_EDITOR_ENTER)

    fun registerEditorActions() {
        EditorActionManager.getInstance().setActionHandler(ACTION_EDITOR_ENTER, CodeWhispererEnterHandler(oldEnterHandler))
    }

    companion object {
        fun getInstance(): CodeWhispererStartupActionsManager = service()
    }

    override fun dispose() {
        EditorActionManager.getInstance().setActionHandler(ACTION_EDITOR_ENTER, oldEnterHandler)
    }
}
