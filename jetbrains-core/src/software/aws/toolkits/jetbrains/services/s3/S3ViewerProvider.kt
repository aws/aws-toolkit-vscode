// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.codeHighlighting.BackgroundEditorHighlighter
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3ViewerPanel
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class S3ViewerEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile) = file is S3VirtualBucket

    override fun createEditor(project: Project, file: VirtualFile) = S3ViewerEditor(file as S3VirtualBucket)

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    override fun getEditorTypeId() = EDITOR_TYPE_ID

    companion object {
        const val EDITOR_TYPE_ID = "S3 Bucket Viewer"
    }
}

class S3ViewerEditor(bucket: S3VirtualBucket) : FileEditor, UserDataHolderBase() {
    private val s3Panel: S3ViewerPanel = S3ViewerPanel(bucket)

    override fun getComponent(): JComponent = s3Panel.component

    override fun getName(): String = "S3 Bucket Panel"

    override fun getPreferredFocusedComponent(): JComponent = s3Panel.component

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

    override fun <T : Any?> getUserData(key: Key<T>): T? = null

    override fun <T : Any?> putUserData(key: Key<T>, value: T?) {}
}
