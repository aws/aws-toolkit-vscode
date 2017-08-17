package com.amazonaws.intellij.ui.explorer

import com.amazonaws.intellij.core.region.AwsRegionManager
import com.amazonaws.intellij.ui.AWS_ICON
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.ClearableLazyValue
import com.intellij.ui.SimpleTextAttributes
import javax.swing.Icon

abstract class AwsExplorerNode<T>(project: Project, value: T, val region: String, val awsIcon: Icon?):
        AbstractTreeNode<T>(project, value) {

    override fun update(presentation: PresentationData?) {
        presentation?.setIcon(awsIcon)
    }

    override fun toString() = value.toString()
}

class AwsExplorerRootNode(project: Project, region: String):
        AwsExplorerNode<String>(project, "ROOT", region, AWS_ICON) {

    override fun getChildren(): Collection<AbstractTreeNode<String>> {
        val childrenList = mutableListOf<AbstractTreeNode<String>>()
        AwsExplorerService.values()
                .filter { AwsRegionManager.isServiceSupported(region, it.serviceId) }
                .mapTo(childrenList) { it.buildServiceRootNode(project!!, region) }

        return childrenList
    }
}

abstract class AwsExplorerServiceRootNode<Resource>(project: Project, value: String, region: String, awsIcon: Icon):
        AwsExplorerNode<String>(project, value, region, awsIcon) {
    val cache: ClearableLazyValue<Collection<AwsExplorerNode<*>>>

    init {
        cache = object : ClearableLazyValue<Collection<AwsExplorerNode<*>>>() {
            override fun compute(): Collection<AwsExplorerNode<*>> {
                return try {
                    val resources = loadResources()
                    if (resources.isEmpty()) {
                        // Return EmptyNode as the single node of the list
                        listOf(AwsExplorerEmptyNode(project, region))
                    } else {
                        resources.map { mapResourceToNode(it) }
                    }
                } catch (e: Exception) {
                    // Return the ErrorNode as the single Node of the list
                    listOf(AwsExplorerErrorNode(project, e, region))
                }
            }
        }
    }

    override fun getChildren(): Collection<AwsExplorerNode<*>> {
        return cache.value
    }

    // This method may throw RuntimeException, must handle it
    abstract fun loadResources(): Collection<Resource>

    abstract fun mapResourceToNode(resource: Resource): AwsExplorerNode<Resource>
}

class AwsExplorerErrorNode(project: Project, exception: Exception, region: String):
        AwsExplorerNode<Exception>(project, exception, region, null) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun toString(): String {
        return "Error Loading Resources..."
    }

    override fun update(presentation: PresentationData?) {
        super.update(presentation)
        presentation?.tooltip = value.message
        presentation?.addText(toString(), SimpleTextAttributes.ERROR_ATTRIBUTES)
    }
}

class AwsExplorerEmptyNode(project: Project, region: String): AwsExplorerNode<String>(project, "empty", region, null) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> {
        return emptyList()
    }

    override fun update(presentation: PresentationData?) {
        super.update(presentation)
        presentation?.addText(toString(), SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }
}
