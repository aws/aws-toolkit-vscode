// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.codeHighlighting.BackgroundEditorHighlighter
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.PossiblyDumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.s3.editor.S3ViewerPanel
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class S3ViewerEditorProvider : FileEditorProvider, PossiblyDumbAware {
    override fun accept(project: Project, file: VirtualFile) = file is S3VirtualBucket

    override fun isDumbAware() = true

    override fun createEditor(project: Project, file: VirtualFile): FileEditor = S3ViewerEditor(project, file as S3VirtualBucket)

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    override fun getEditorTypeId() = EDITOR_TYPE_ID

    companion object {
        const val EDITOR_TYPE_ID = "S3 Bucket Viewer"
    }
}

class S3ViewerEditor(project: Project, bucket: S3VirtualBucket) : UserDataHolderBase(), FileEditor {
    private val s3Panel: S3ViewerPanel = S3ViewerPanel(this, project, bucket)

    override fun getComponent(): JComponent = s3Panel.component

    override fun getName(): String = "S3 Bucket Panel"

    override fun getPreferredFocusedComponent(): JComponent = s3Panel.focusComponent

    override fun isValid(): Boolean = true

    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun getState(level: FileEditorStateLevel): FileEditorState = FileEditorState.INSTANCE

    override fun isModified(): Boolean = false

    override fun dispose() {}

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun deselectNotify() {}

    override fun getBackgroundHighlighter(): BackgroundEditorHighlighter? = null

    override fun selectNotify() {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun setState(state: FileEditorState) {}
}

fun openEditor(project: Project, bucket: Bucket) {
    try {
        FileEditorManager.getInstance(project).openTextEditor(OpenFileDescriptor(project, S3VirtualBucket(bucket, project.awsClient())), true)
        S3Telemetry.openEditor(project, Result.SUCCEEDED)
    } catch (e: Exception) {
        e.notifyError(message("s3.open.viewer.bucket.failed"))
        S3Telemetry.openEditor(project, Result.FAILED)
    }
}
