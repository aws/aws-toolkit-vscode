package software.aws.toolkits.jetbrains.ui.s3


import com.intellij.codeHighlighting.BackgroundEditorHighlighter
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.aws.s3.S3BucketViewerPanel
import software.aws.toolkits.jetbrains.aws.s3.S3BucketVirtualFile
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class S3BucketViewer(private val project: Project, private val s3Bucket: S3BucketVirtualFile)
    : UserDataHolderBase(), FileEditor {

    private val bucketViewer: S3BucketViewerPanel = S3BucketViewerPanel(project, s3Bucket)

    override fun getName() = "S3 Bucket Viewer"

    override fun getComponent(): JComponent = bucketViewer.component

    override fun dispose() {}

    override fun isModified(): Boolean = false

    override fun getState(level: FileEditorStateLevel): FileEditorState = FileEditorState.INSTANCE

    override fun setState(state: FileEditorState) {}

    override fun getPreferredFocusedComponent(): JComponent? = null

    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun selectNotify() {}

    override fun deselectNotify() {}

    override fun getBackgroundHighlighter(): BackgroundEditorHighlighter? = null

    override fun isValid(): Boolean = true

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}
}

class S3BucketViewerProvider : FileEditorProvider, DumbAware {
    override fun getEditorTypeId() = EDITOR_TYPE_ID

    override fun accept(project: Project, file: VirtualFile) = file is S3BucketVirtualFile

    override fun createEditor(project: Project, file: VirtualFile) = S3BucketViewer(project, file as S3BucketVirtualFile)

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        const val EDITOR_TYPE_ID = "s3Bucket"
    }
}