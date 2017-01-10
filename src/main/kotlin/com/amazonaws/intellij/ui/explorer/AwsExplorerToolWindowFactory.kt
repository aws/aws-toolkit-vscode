package com.amazonaws.intellij.ui.explorer

import com.amazonaws.services.s3.AmazonS3Client
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import java.awt.Component
import javax.swing.Icon
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeCellRenderer

class AwsExplorerToolWindow : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, window: ToolWindow) {
        val s3Client = AmazonS3Client()
        val s3DetailsView = S3BucketDetailView()
        val s3DetailsController = S3BucketDetailController(s3Client, s3DetailsView)
        val mainEventHandler = AwsExplorerMainEventHandler(s3DetailsController)
        val mainView = AwsExplorerMainView(mainEventHandler, s3DetailsView)
        val mainController = AwsExplorerMainController(s3Client, mainView)
        mainController.load()
        window.component.parent.add(mainView)
    }
}

interface HasIcon {
    val icon: Icon
}

class AwsTreeNode<T>(override val icon: Icon, val value: T, toName: (T) -> String = { it.toString() }) : HasIcon, DefaultMutableTreeNode(toName(value))

class TreeCellRenderer : DefaultTreeCellRenderer() {
    override fun getTreeCellRendererComponent(tree: JTree?, value: Any?, sel: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean): Component {
        super.getTreeCellRendererComponent(tree, value, sel, expanded, leaf, row, hasFocus)
        when(value) {
            is HasIcon -> icon = value.icon
        }
        return this
    }
}