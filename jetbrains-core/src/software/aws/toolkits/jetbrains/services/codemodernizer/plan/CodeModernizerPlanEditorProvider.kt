// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.plan

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend

class CodeModernizerPlanEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile) = file is CodeModernizerPlanVirtualFile

    override fun createEditor(project: Project, file: VirtualFile) = CodeModernizerPlanEditor(project, file)

    override fun getEditorTypeId() = "CodeModernizerPlanEditor"

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        private val LOG = getLogger<CodeModernizerPlanEditorProvider>()
        val MIGRATION_PLAN_KEY = Key.create<TransformationPlan>("TRANSFORMATION_PLAN")
        val MODULE_NAME_KEY = Key.create<String>("MODULE_NAME")
        val JAVA_VERSION = Key.create<String>("JAVA_VERSION")
        fun openEditor(project: Project, plan: TransformationPlan, module: String?, javaVersionNumber: String) {
            if (isRunningOnRemoteBackend()) return
            val virtualFile = CodeModernizerPlanVirtualFile()
            virtualFile.putUserData(MIGRATION_PLAN_KEY, plan)
            virtualFile.putUserData(MODULE_NAME_KEY, module)
            virtualFile.putUserData(JAVA_VERSION, javaVersionNumber)
            runInEdt {
                try {
                    FileEditorManager
                        .getInstance(project)
                        .openFileEditor(OpenFileDescriptor(project, virtualFile), true)
                } catch (e: Exception) {
                    LOG.debug(e) { "Getting Started page failed to open" }
                }
            }
        }
    }
}
