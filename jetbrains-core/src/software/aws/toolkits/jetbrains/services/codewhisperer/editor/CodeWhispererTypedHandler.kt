// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.codeInsight.editorActions.TypedHandlerDelegate
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererTriggerType

class CodeWhispererTypedHandler : TypedHandlerDelegate(), CodeWhispererAutoTriggerHandler {
    private var triggerOnIdle: Job? = null
    override fun charTyped(c: Char, project: Project, editor: Editor, psiFiles: PsiFile): Result {
        triggerOnIdle?.cancel()
        val latencyContext = LatencyContext()
        latencyContext.codewhispererPreprocessingStart = System.nanoTime()
        latencyContext.codewhispererEndToEndStart = System.nanoTime()
        if (!CodeWhispererService.getInstance().canDoInvocation(editor, CodewhispererTriggerType.AutoTrigger)) {
            return Result.CONTINUE
        }
        if (CodeWhispererConstants.SPECIAL_CHARACTERS_LIST.contains(c.toString())) {
            performAutomatedTriggerAction(editor, CodewhispererAutomatedTriggerType.SpecialCharacters, latencyContext)
            return Result.CONTINUE
        }
        triggerOnIdle = projectCoroutineScope(project).launch {
            // TODO: potential race condition between hasExistingInvocation and entering edt
            // but in that case we will just return in performAutomatedTriggerAction
            while (!CodeWhispererInvocationStatus.getInstance().hasEnoughDelayToInvokeCodeWhisperer() ||
                CodeWhispererInvocationStatus.getInstance().hasExistingInvocation()
            ) {
                if (!isActive) return@launch
                delay(CodeWhispererConstants.IDLE_TIME_CHECK_INTERVAL)
            }
            runInEdt {
                if (CodeWhispererInvocationStatus.getInstance().isPopupActive()) return@runInEdt
                performAutomatedTriggerAction(editor, CodewhispererAutomatedTriggerType.IdleTime, latencyContext)
            }
        }

        return Result.CONTINUE
    }
}
