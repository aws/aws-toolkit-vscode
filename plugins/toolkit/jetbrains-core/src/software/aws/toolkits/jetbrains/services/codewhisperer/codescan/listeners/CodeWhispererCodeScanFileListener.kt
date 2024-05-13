// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.listeners

import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isUserBuilderId
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants

internal class CodeWhispererCodeScanFileListener(val project: Project) : EditorFactoryListener {
    override fun editorCreated(event: EditorFactoryEvent) {
        if (!CodeWhispererExplorerActionManager.getInstance().isMonthlyQuotaForCodeScansExceeded() && !isUserBuilderId(project)) {
            CodeWhispererCodeScanManager.getInstance(project).createDebouncedRunCodeScan(CodeWhispererConstants.CodeAnalysisScope.FILE)
        }
    }
}
