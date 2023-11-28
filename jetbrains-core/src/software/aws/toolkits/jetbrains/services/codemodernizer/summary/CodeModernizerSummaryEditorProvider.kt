// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.summary

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codemodernizer.TransformationSummary
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend

class CodeModernizerSummaryEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile) = file is CodeModernizerSummaryVirtualFile

    override fun createEditor(project: Project, file: VirtualFile) = CodeModernizerSummaryEditor(project, file)

    override fun getEditorTypeId() = "CodeModernizerSummaryEditor"

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        private val LOG = getLogger<CodeModernizerSummaryEditorProvider>()
        val MIGRATION_SUMMARY_KEY = Key.create<TransformationSummary>("")

        fun openEditor(project: Project, summary: TransformationSummary) {
            if (isRunningOnRemoteBackend()) return
            val virtualFile = CodeModernizerSummaryVirtualFile()
            virtualFile.putUserData(MIGRATION_SUMMARY_KEY, summary)
            runInEdt {
                try {
                    FileEditorManager
                        .getInstance(project)
                        .openFileEditor(OpenFileDescriptor(project, virtualFile), true)
                } catch (e: Exception) {
                    LOG.debug(e) { "Showing transformation job summary  page failed to open" }
                }
            }
        }
    }
}
