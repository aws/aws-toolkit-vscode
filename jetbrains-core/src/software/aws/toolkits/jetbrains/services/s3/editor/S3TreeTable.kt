// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.ex.FileTypeChooser
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFileWrapper
import com.intellij.ui.treeStructure.treetable.TreeTable
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.s3.objectActions.deleteSelectedObjects
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.UnsupportedFlavorException
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDropEvent
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.io.File
import javax.swing.tree.DefaultMutableTreeNode

class S3TreeTable(
    private val treeTableModel: S3TreeTableModel,
    val bucket: S3VirtualBucket,
    private val project: Project
) : TreeTable(treeTableModel) {

    private val dropTargetListener = object : DropTargetAdapter() {
        override fun drop(dropEvent: DropTargetDropEvent) {
            val node = rowAtPoint(dropEvent.location).takeIf { it >= 0 }?.let { getNodeForRow(it) } ?: getRootNode()
            val data = try {
                dropEvent.acceptDrop(DnDConstants.ACTION_COPY_OR_MOVE)
                dropEvent.transferable.getTransferData(DataFlavor.javaFileListFlavor) as List<File>
            } catch (e: UnsupportedFlavorException) {
                // When the drag and drop data is not what we expect (like when it is text) this is thrown and can be safey ignored
                LOG.info(e) { "Unsupported flavor attempted to be dragged and dropped" }
                return
            }

            val lfs = LocalFileSystem.getInstance()
            val virtualFiles = data.mapNotNull {
                lfs.findFileByIoFile(it)
            }

            val directoryKey = node.getDirectoryKey()

            GlobalScope.launch {
                virtualFiles.forEach {
                    try {
                        bucket.upload(project, it.inputStream, it.length, directoryKey + it.name)
                        invalidateLevel(node)
                        refresh()
                    } catch (e: Exception) {
                        e.notifyError(message("s3.upload.object.failed", it.name))
                    }
                }
            }
        }
    }

    private val mouseListener = object : MouseAdapter() {
        override fun mouseClicked(e: MouseEvent) {
            val row = rowAtPoint(e.point).takeIf { it >= 0 } ?: return
            handleOpeningFile(row, e)
            handleLoadingMore(row, e)
        }
    }

    override fun processKeyEvent(e: KeyEvent?) {
        if (e?.keyCode == KeyEvent.VK_DELETE || e?.keyCode == KeyEvent.VK_BACK_SPACE) {
            e.consume()
            deleteSelectedObjects(project, this@S3TreeTable)
        }
        super.processKeyEvent(e)
    }

    private fun handleOpeningFile(row: Int, e: MouseEvent) {
        if (e.clickCount < 2) {
            return
        }
        val objectNode = (tree.getPathForRow(row).lastPathComponent as? DefaultMutableTreeNode)?.userObject as? S3TreeObjectNode ?: return
        if (objectNode.size > S3TreeObjectNode.MAX_FILE_SIZE_TO_OPEN_IN_IDE) {
            notifyError(message("s3.open.file_too_big", StringUtil.formatFileSize(S3TreeObjectNode.MAX_FILE_SIZE_TO_OPEN_IN_IDE.toLong())))
            return
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
                        notifyError(message("s3.open.viewer.failed"))
                    }
                }
            }
        }
    }

    private fun handleLoadingMore(row: Int, e: MouseEvent) {
        if (e.clickCount < 2) {
            return
        }
        val continuationNode = (tree.getPathForRow(row).lastPathComponent as? DefaultMutableTreeNode)?.userObject as? S3TreeContinuationNode ?: return
        val parent = continuationNode.parent ?: return

        ApplicationManager.getApplication().executeOnPooledThread {
            parent.loadMore(continuationNode.token)
            refresh()
        }
    }

    init {
        // Associate the drop target listener with this instance which will allow uploading by drag and drop
        DropTarget(this, dropTargetListener)
    }

    fun refresh() {
        runInEdt {
            clearSelection()
            treeTableModel.structureTreeModel.invalidate()
        }
    }

    init {
        super.addMouseListener(mouseListener)
    }

    fun getNodeForRow(row: Int): S3TreeNode? {
        val path = tree.getPathForRow(convertRowIndexToModel(row))
        return (path.lastPathComponent as DefaultMutableTreeNode).userObject as? S3TreeNode
    }

    fun getRootNode(): S3TreeDirectoryNode = (tableModel.root as DefaultMutableTreeNode).userObject as S3TreeDirectoryNode

    fun getSelectedNodes(): List<S3TreeNode> = selectedRows.map { getNodeForRow(it) }.filterNotNull()

    fun removeRows(rows: List<Int>) =
        runInEdt {
            rows.map {
                val path = tree.getPathForRow(it)
                path.lastPathComponent as DefaultMutableTreeNode
            }.forEach {
                val userNode = it.userObject as? S3TreeNode ?: return@forEach
                ((it.parent as? DefaultMutableTreeNode)?.userObject as? S3TreeDirectoryNode)?.removeChild(userNode)
            }
        }

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
