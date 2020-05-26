// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.ui.PopupHandler
import com.intellij.ui.ToolbarDecorator
import com.intellij.ui.treeStructure.SimpleTreeStructure
import software.aws.toolkits.jetbrains.services.s3.objectActions.CopyPathAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.DeleteObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.NewFolderAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RefreshSubTreeAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RefreshTreeAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RenameObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.UploadObjectAction
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel
import javax.swing.JComponent
import javax.swing.SwingConstants
import javax.swing.table.DefaultTableCellRenderer

class S3ViewerPanel(disposable: Disposable, private val project: Project, private val virtualBucket: S3VirtualBucket) {
    val component: JComponent
    val treeTable: S3TreeTable
    private val rootNode: S3TreeDirectoryNode = S3TreeDirectoryNode(virtualBucket, null, "")

    init {
        val structureTreeModel: StructureTreeModel<SimpleTreeStructure> = StructureTreeModel(SimpleTreeStructure.Impl(rootNode), disposable)
        val model = S3TreeTableModel(
            AsyncTreeModel(structureTreeModel, true, disposable),
            arrayOf(S3Column(S3ColumnType.NAME), S3Column(S3ColumnType.SIZE), S3Column(S3ColumnType.LAST_MODIFIED)),
            structureTreeModel
        )
        treeTable = S3TreeTable(model, rootNode, virtualBucket, project).also {
            it.setRootVisible(false)
            it.cellSelectionEnabled = false
            it.rowSelectionAllowed = true
            it.rowSorter = S3RowSorter(it.model)
            // prevent accidentally moving the columns around. We don't account for the ability
            // to do this anywhere so better be safe than sorry. TODO audit logic to allow this
            it.tableHeader.reorderingAllowed = false
            it.columnModel.getColumn(1).maxWidth = 120
        }
        component = addToolbar().createPanel()
        val treeRenderer = S3TreeCellRenderer(treeTable)
        treeTable.setTreeCellRenderer(treeRenderer)
        val tableRenderer = DefaultTableCellRenderer().also { it.horizontalAlignment = SwingConstants.LEFT }
        treeTable.setDefaultRenderer(Any::class.java, tableRenderer)
        PopupHandler.installPopupHandler(
            treeTable,
            createCommonActionGroup(treeTable).also {
                it.addAction(RefreshSubTreeAction(treeTable))
            },
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun addToolbar(): ToolbarDecorator {
        val group = createCommonActionGroup(treeTable).also {
            it.addAction(RefreshTreeAction(treeTable, rootNode))
        }
        return ToolbarDecorator.createDecorator(treeTable).setActionGroup(group)
    }

    private fun createCommonActionGroup(table: S3TreeTable): DefaultActionGroup = DefaultActionGroup().also {
        it.add(DownloadObjectAction(project, table))
        it.add(UploadObjectAction(project, table))
        it.add(Separator())
        it.add(NewFolderAction(project, table))
        it.add(RenameObjectAction(project, table).apply {
            registerCustomShortcutSet(CommonShortcuts.getRename(), table)
        })
        it.add(CopyPathAction(project, table))
        it.add(Separator())
        it.add(DeleteObjectAction(project, table))
        it.add(Separator())
    }
}
