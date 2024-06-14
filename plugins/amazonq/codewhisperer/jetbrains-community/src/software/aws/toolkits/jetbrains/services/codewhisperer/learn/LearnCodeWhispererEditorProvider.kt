// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.telemetry.UiTelemetry

class LearnCodeWhispererEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean = file is LearnCodeWhispererVirtualFile

    override fun createEditor(project: Project, file: VirtualFile): FileEditor = LearnCodeWhispererManager.getInstance(project).getEditor(file)

    override fun getEditorTypeId(): String = "LearnCodeWhispererEditor"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        private val LOG = getLogger<LearnCodeWhispererEditorProvider>()

        // Will be called every time the getting started page is opened
        fun openEditor(project: Project) {
            if (isRunningOnRemoteBackend()) return

            val virtualFile = LearnCodeWhispererVirtualFile()

            runInEdt {
                try {
                    FileEditorManager.getInstance(project).openFileEditor(OpenFileDescriptor(project, virtualFile), true)
                    UiTelemetry.click(project, "codewhisperer_Learn_PageOpen")
                    CodeWhispererExplorerActionManager.getInstance().setHasShownNewOnboardingPage(true)
                } catch (e: Exception) {
                    LOG.debug(e) { "Getting Started page failed to open" }
                }
            }
        }
    }
}
