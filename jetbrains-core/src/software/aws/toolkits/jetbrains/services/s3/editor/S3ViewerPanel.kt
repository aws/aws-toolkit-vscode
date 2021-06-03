// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.ide.DataManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.project.Project
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SearchTextField
import com.intellij.ui.SideBorder
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.SimpleTreeStructure
import com.intellij.util.concurrency.Invoker
import com.intellij.util.text.nullize
import software.aws.toolkits.jetbrains.utils.ui.onEmpty
import software.aws.toolkits.jetbrains.utils.ui.onEnter
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingConstants
import javax.swing.table.DefaultTableCellRenderer

class S3ViewerPanel(private val disposable: Disposable, private val project: Project, virtualBucket: S3VirtualBucket) {
    val component: JComponent
    lateinit var treeTable: S3TreeTable
        private set
    private val filterComponent: JComponent
    private lateinit var toolbarComponent: JComponent

    init {
        component = JPanel(BorderLayout())

        filterComponent = SearchTextField()
        filterComponent.textEditor.text = virtualBucket.prefix
        filterComponent.textEditor.emptyText.text = message("s3.prefix.filter")
        val handler = {
            component.removeAll()
            virtualBucket.prefix = filterComponent.text.nullize(nullizeSpaces = true) ?: ""
            setupTreeTable(virtualBucket)
        }

        filterComponent.onEnter(handler)
        filterComponent.onEmpty {
            // only refresh if view is currently filtered
            if (virtualBucket.prefix.isNotBlank()) {
                handler()
            }
        }

        DataManager.registerDataProvider(component) {
            when {
                S3EditorDataKeys.SELECTED_NODES.`is`(it) -> treeTable.getSelectedNodes()
                S3EditorDataKeys.BUCKET_TABLE.`is`(it) -> treeTable
                else -> null
            }
        }

        setupTreeTable(virtualBucket)
    }

    private fun setupTreeTable(virtualBucket: S3VirtualBucket) {
        treeTable = createTreeTable(disposable, virtualBucket)
        toolbarComponent = createToolbar(treeTable).component
        toolbarComponent.border = IdeBorderFactory.createBorder(SideBorder.TOP)

        setupContextMenu(treeTable)

        val panel = JPanel(BorderLayout())
        panel.add(toolbarComponent, BorderLayout.CENTER)
        panel.add(filterComponent, BorderLayout.EAST)

        component.add(panel, BorderLayout.NORTH)
        component.add(ScrollPaneFactory.createScrollPane(treeTable), BorderLayout.CENTER)
    }

    private fun createTreeTable(disposable: Disposable, virtualBucket: S3VirtualBucket): S3TreeTable {
        val rootNode = if (virtualBucket.prefix.isNotBlank()) {
            S3TreePrefixedDirectoryNode(virtualBucket)
        } else {
            S3TreeDirectoryNode(virtualBucket, null, "")
        }

        val structureTreeModel: StructureTreeModel<SimpleTreeStructure> = StructureTreeModel(
            SimpleTreeStructure.Impl(rootNode),
            null,
            // TODO this has a concurrency of 1, do we want to adjust this?
            Invoker.forBackgroundThreadWithoutReadAction(disposable),
            disposable
        )
        val model = S3TreeTableModel(
            AsyncTreeModel(structureTreeModel, true, disposable),
            arrayOf(S3Column(S3ColumnType.NAME), S3Column(S3ColumnType.SIZE), S3Column(S3ColumnType.LAST_MODIFIED)),
            structureTreeModel
        )
        val treeTable = S3TreeTable(model, rootNode, virtualBucket, project).also {
            it.setRootVisible(rootNode is S3TreePrefixedDirectoryNode)
            it.cellSelectionEnabled = false
            it.rowSelectionAllowed = true
            it.rowSorter = S3RowSorter(it.model)
            // prevent accidentally moving the columns around. We don't account for the ability
            // to do this anywhere so better be safe than sorry. TODO audit logic to allow this
            it.tableHeader.reorderingAllowed = false
            it.columnModel.getColumn(1).maxWidth = 120
        }

        val treeRenderer = S3TreeCellRenderer(treeTable)
        treeTable.setTreeCellRenderer(treeRenderer)
        val tableRenderer = DefaultTableCellRenderer().also { it.horizontalAlignment = SwingConstants.LEFT }
        treeTable.setDefaultRenderer(Any::class.java, tableRenderer)

        return treeTable
    }

    private fun createToolbar(s3TreeTable: S3TreeTable): ActionToolbar {
        val actionManager = ActionManager.getInstance()
        val group = actionManager.getAction("aws.toolkit.s3viewer.toolbar") as ActionGroup
        val toolbar = actionManager.createActionToolbar(ACTION_PLACE, group, true)
        toolbar.setTargetComponent(s3TreeTable)
        return toolbar
    }

    private fun setupContextMenu(treeTable: S3TreeTable) {
        val actionManager = ActionManager.getInstance()
        val group = actionManager.getAction("aws.toolkit.s3viewer.contextMenu") as ActionGroup

        PopupHandler.installPopupHandler(
            treeTable,
            group,
            ACTION_PLACE,
        )
    }

    private companion object {
        const val ACTION_PLACE = "S3ViewerPanel"
    }
}
