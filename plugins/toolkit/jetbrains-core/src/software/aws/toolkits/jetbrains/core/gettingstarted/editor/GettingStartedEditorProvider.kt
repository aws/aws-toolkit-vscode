// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted.editor

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

class GettingStartedEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile) = file is GettingStartedVirtualFile

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        file as GettingStartedVirtualFile
        val firstInstance = file.firstInstance
        return GettingStartedEditor(project, file, firstInstance, file.connectionInitiatedFromExplorer)
    }

    override fun getEditorTypeId() = EDITOR_TYPE

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        const val EDITOR_TYPE = "GettingStartedUxMainPanel"
    }
}
