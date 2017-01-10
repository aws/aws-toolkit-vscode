package com.amazonaws.intellij.ui.explorer

import com.amazonaws.intellij.ui.*
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.Bucket
import java.awt.Dimension
import java.awt.GridLayout
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JSplitPane
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreeNode

class AwsExplorerMainEventHandler(private val s3DetailsController: S3BucketDetailController) {
    fun resourceSelected(selected: Any) {
        when(selected) {
            is AwsTreeNode<*> -> when(selected.value) {
                is Bucket -> s3DetailsController.update(selected.value)
            }
        }
    }
}

class AwsExplorerMainController(private val s3Client: AmazonS3, private val view: AwsExplorerMainView) {
    fun load() {
        view.updateResources(createResourcesTree())
    }

    private fun createResourcesTree(): TreeNode {
        val root = DefaultMutableTreeNode(AwsTreeNode(AWS_ICON, "Resources"))
        val s3Node = AwsTreeNode(S3_SERVICE_ICON, "S3")
        s3Client.listBuckets().forEach { s3Node.add(AwsTreeNode(S3_BUCKET_ICON, it, Bucket::getName)) }
        root.add(s3Node)
        return root
    }
}

class AwsExplorerMainView(eventHandler: AwsExplorerMainEventHandler, s3DetailsView : S3BucketDetailView) : JPanel(GridLayout()) {
    val resources = JTree()

    init {
        val details = JPanel(GridLayout())
        details.add(s3DetailsView)
        resources.isRootVisible = false
        resources.autoscrolls = true
        resources.addTreeSelectionListener { eventHandler.resourceSelected(it.path.lastPathComponent) }
        resources.cellRenderer = TreeCellRenderer()
        val main = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, JScrollPane(resources), details)
        main.leftComponent.preferredSize = Dimension(500, 100)
        main.dividerSize = 2
        add(main)
    }

    fun updateResources(root: TreeNode) {
        (resources.model as DefaultTreeModel).setRoot(root)
    }
}