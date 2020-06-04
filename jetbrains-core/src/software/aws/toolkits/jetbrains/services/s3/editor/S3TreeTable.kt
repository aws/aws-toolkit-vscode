// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.ex.FileTypeChooser
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.util.io.FileUtilRt.getUserContentLoadLimit
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileWrapper
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.TreeTableSpeedSearch
import com.intellij.ui.treeStructure.treetable.TreeTable
import com.intellij.util.containers.Convertor
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.s3.objectActions.deleteSelectedObjects
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.UnsupportedFlavorException
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDropEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseEvent
import java.io.File
import javax.swing.tree.DefaultMutableTreeNode

class S3TreeTable(
    private val treeTableModel: S3TreeTableModel,
    val rootNode: S3TreeDirectoryNode,
    val bucket: S3VirtualBucket,
    private val project: Project
) : TreeTable(treeTableModel) {

    private val dropTargetListener = object : DropTargetAdapter() {
        override fun drop(dropEvent: DropTargetDropEvent) {
            val node = rowAtPoint(dropEvent.location).takeIf { it >= 0 }?.let { getNodeForRow(it) } ?: rootNode
            val data = try {
                dropEvent.acceptDrop(DnDConstants.ACTION_COPY_OR_MOVE)
                val list = dropEvent.transferable.getTransferData(DataFlavor.javaFileListFlavor) as List<*>
                list.filterIsInstance<File>()
            } catch (e: UnsupportedFlavorException) {
                // When the drag and drop data is not what we expect (like when it is text) this is thrown and can be safey ignored
                LOG.info(e) { "Unsupported flavor attempted to be dragged and dropped" }
                return
            }

            val lfs = LocalFileSystem.getInstance()
            val virtualFiles = data.mapNotNull {
                lfs.findFileByIoFile(it)
            }

            uploadAndRefresh(virtualFiles, node)
        }
    }

    private val openFileListener = object : DoubleClickListener() {
        override fun onDoubleClick(e: MouseEvent?): Boolean {
            e ?: return false
            val row = rowAtPoint(e.point).takeIf { it >= 0 } ?: return false
            return handleOpeningFile(row)
        }
    }

    private val loadMoreListener = object : DoubleClickListener() {
        override fun onDoubleClick(e: MouseEvent?): Boolean {
            e ?: return false
            val row = rowAtPoint(e.point).takeIf { it >= 0 } ?: return false
            return handleLoadingMore(row)
        }
    }

    private val keyListener = object : KeyAdapter() {
        override fun keyTyped(e: KeyEvent) = doProcessKeyEvent(e)
    }

    private fun doProcessKeyEvent(e: KeyEvent) {
        if (!e.isConsumed && (e.keyCode == KeyEvent.VK_DELETE || e.keyCode == KeyEvent.VK_BACK_SPACE)) {
            e.consume()
            deleteSelectedObjects(project, this@S3TreeTable)
        }
        if (e.keyCode == KeyEvent.VK_ENTER && selectedRowCount == 1) {
            handleOpeningFile(selectedRow)
            handleLoadingMore(selectedRow)
        }
    }

    private fun handleOpeningFile(row: Int): Boolean {
        val objectNode = (tree.getPathForRow(row).lastPathComponent as? DefaultMutableTreeNode)?.userObject as? S3TreeObjectNode ?: return false
        val maxFileSize = getUserContentLoadLimit()
        if (objectNode.size > maxFileSize) {
            notifyError(content = message("s3.open.file_too_big", StringUtil.formatFileSize(maxFileSize.toLong())))
            return true
        }
        val fileWrapper = VirtualFileWrapper(File("${FileUtil.getTempDirectory()}${File.separator}${objectNode.key.replace('/', '_')}"))
        // set the file to not be read only so that the S3Client can write to the file
        ApplicationManager.getApplication().runWriteAction {
            fileWrapper.virtualFile?.isWritable = true
        }

        GlobalScope.launch {
            bucket.download(project, objectNode.key, fileWrapper.file.outputStream())
            runInEdt {
                // If the file type is not associated, prompt user to associate. Returns null on cancel
                fileWrapper.virtualFile?.let {
                    ApplicationManager.getApplication().runWriteAction {
                        it.isWritable = false
                    }
                    FileTypeChooser.getKnownFileTypeOrAssociate(it, project) ?: return@runInEdt
                    // set virtual file to read only
                    FileEditorManager.getInstance(project).openFile(it, true, true).ifEmpty {
                        notifyError(project = project, content = message("s3.open.viewer.failed"))
                    }
                }
            }
        }
        return true
    }

    private fun handleLoadingMore(row: Int): Boolean {
        val continuationNode = (tree.getPathForRow(row).lastPathComponent as? DefaultMutableTreeNode)?.userObject as? S3TreeContinuationNode ?: return false
        val parent = continuationNode.parent ?: return false

        GlobalScope.launch {
            parent.loadMore(continuationNode.token)
            refresh()
        }

        return true
    }

    init {
        // Associate the drop target listener with this instance which will allow uploading by drag and drop
        DropTarget(this, dropTargetListener)
        TreeTableSpeedSearch(this, Convertor { obj ->
            val node = obj.lastPathComponent as DefaultMutableTreeNode
            val userObject = node.userObject as? S3TreeNode ?: return@Convertor null
            return@Convertor if (userObject !is S3TreeContinuationNode) {
                userObject.name
            } else {
                null
            }
        })
        loadMoreListener.installOn(this)
        openFileListener.installOn(this)
        super.addKeyListener(keyListener)
    }

    fun uploadAndRefresh(selectedFiles: List<VirtualFile>, node: S3TreeNode) {
        if (selectedFiles.isEmpty()) {
            LOG.warn { "Zero files passed into s3 uploadAndRefresh, not attempting upload or refresh" }
            return
        }
        GlobalScope.launch {
            try {
                selectedFiles.forEach {
                    if (it.isDirectory) {
                        notifyError(
                            title = message("s3.upload.object.failed", it.name),
                            content = message("s3.upload.directory.impossible", it.name),
                            project = project
                        )
                        return@forEach
                    }

                    try {
                        bucket.upload(project, it.inputStream, it.length, node.getDirectoryKey() + it.name)
                        invalidateLevel(node)
                        refresh()
                    } catch (e: Exception) {
                        e.notifyError(message("s3.upload.object.failed", it.path), project)
                        throw e
                    }
                }
                S3Telemetry.uploadObjects(project, Result.Succeeded, selectedFiles.size.toDouble())
            } catch (e: Exception) {
                S3Telemetry.uploadObjects(project, Result.Failed, selectedFiles.size.toDouble())
            }
        }
    }

    fun refresh() {
        runInEdt {
            clearSelection()
            treeTableModel.structureTreeModel.invalidate()
        }
    }

    fun getNodeForRow(row: Int): S3TreeNode? {
        val path = tree.getPathForRow(convertRowIndexToModel(row))
        return (path.lastPathComponent as DefaultMutableTreeNode).userObject as? S3TreeNode
    }

    fun getSelectedNodes(): List<S3TreeNode> = selectedRows.map { getNodeForRow(it) }.filterNotNull()

    fun invalidateLevel(node: S3TreeNode) {
        when (node) {
            is S3TreeDirectoryNode -> node.removeAllChildren()
            else -> node.parent?.removeAllChildren()
        }
    }

    companion object {
        private val LOG = getLogger<S3TreeTable>()
    }
}
