package software.aws.toolkits.jetbrains.aws.s3

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileChooser.FileSystemTree
import com.intellij.openapi.fileChooser.FileSystemTreeFactory
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.JBSplitter
import com.intellij.ui.ToolbarDecorator
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.Wrapper
import software.aws.toolkits.jetbrains.ui.s3.BucketDetailsPanel
import software.aws.toolkits.jetbrains.ui.s3.ObjectDetailsPanel
import java.awt.BorderLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.JPanel

class S3BucketViewerPanel(private val project: Project, private val s3bucket: S3VirtualBucket) {
    private val splitPanel: JBSplitter
    private val s3FileTree: S3FileTree
    private val detailPane: Wrapper

    init {
        s3FileTree = S3FileTree()

        detailPane = Wrapper(JBLabel())

        splitPanel = JBSplitter(0.25f)
        splitPanel.firstComponent = s3FileTree
        splitPanel.secondComponent = detailPane
    }

    val component: JComponent
        get() = splitPanel

    private var details: JComponent? = null
        set(component) {
            detailPane.setContent(component ?: JBLabel())
        }

    private inner class S3FileTree() : JPanel(BorderLayout()) {
        private val fileSystemTree: FileSystemTree

        init {
            val fileDescriptor = FileChooserDescriptorFactory.createSingleFileOrFolderDescriptor()
                    .withRoots(s3bucket)
                    .withTreeRootVisible(true)

            fileSystemTree = FileSystemTreeFactory.SERVICE.getInstance()
                    .createFileSystemTree(project, fileDescriptor)

            val tree = fileSystemTree.tree
            tree.addMouseListener(object : MouseAdapter() {
                override fun mouseClicked(e: MouseEvent) {
                    if(e.clickCount >= 2) {
                        handleDoubleClick()
                    }
                }
            })
            tree.addTreeSelectionListener { handleSelectionChange(fileSystemTree) }

            val toolbar = ToolbarDecorator.createDecorator(tree)

            add(toolbar.createPanel(), BorderLayout.CENTER)
        }

        private fun handleDoubleClick() {
            val selectedFile = fileSystemTree.selectedFile
            when(selectedFile) {
                is S3VirtualFile -> FileEditorManager.getInstance(project).openFile(selectedFile, true)
            }
        }

        private fun handleSelectionChange(tree: FileSystemTree) {
            val selectedFiles = tree.selectedFiles
            if (selectedFiles.size != 1) {
                details = null
                return
            }

            val selectedFile = selectedFiles[0]
            details = when (selectedFile) {
                is S3VirtualBucket -> BucketDetailsPanel(project, selectedFile).component
                is S3VirtualFile -> ObjectDetailsPanel(selectedFile).component
                else -> null
            }
        }
    }
}
