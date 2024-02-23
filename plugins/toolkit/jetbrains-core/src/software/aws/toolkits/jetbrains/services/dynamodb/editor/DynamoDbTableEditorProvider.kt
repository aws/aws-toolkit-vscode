// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DynamodbTelemetry
import software.aws.toolkits.telemetry.Result

class DynamoDbTableEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean = file is DynamoDbVirtualFile

    override fun createEditor(project: Project, file: VirtualFile): FileEditor = DynamoDbTableEditor(file as DynamoDbVirtualFile)

    override fun getEditorTypeId(): String = "DynamoDbTableEditor"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        fun openViewer(project: Project, tableArn: String) {
            try {
                val virtualFile = DynamoDbVirtualFile(tableArn, project.getConnectionSettingsOrThrow())
                FileEditorManager.getInstance(project).openTextEditor(
                    OpenFileDescriptor(project, virtualFile),
                    /*focusEditor*/
                    true
                )

                DynamodbTelemetry.openTable(project, Result.Succeeded)
            } catch (e: Exception) {
                e.notifyError(message("dynamodb.viewer.open.failed"))
                DynamodbTelemetry.openTable(project, Result.Failed)
            }
        }
    }
}
