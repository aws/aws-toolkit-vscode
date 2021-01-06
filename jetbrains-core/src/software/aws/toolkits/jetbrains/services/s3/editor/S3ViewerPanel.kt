// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.ui.PopupHandler
import com.intellij.ui.ToolbarDecorator
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.SimpleTreeStructure
import com.intellij.util.concurrency.Invoker
import software.aws.toolkits.jetbrains.services.s3.objectActions.CopyPathAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.CopyUriAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.CopyUrlAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.DeleteObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.NewFolderAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RefreshSubTreeAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RefreshTreeAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RenameObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.UploadObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.ViewObjectVersionAction
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.SwingConstants
import javax.swing.table.DefaultTableCellRenderer

class S3ViewerPanel(disposable: Disposable, private val project: Project, virtualBucket: S3VirtualBucket) {
    val component: JComponent
    val treeTable: S3TreeTable
    private val rootNode: S3TreeDirectoryNode = S3TreeDirectoryNode(virtualBucket, null, "")

    init {
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
            createCommonActionGroup(treeTable, addCopy = true).also {
                it.addAction(RefreshSubTreeAction(treeTable))
            },
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun addToolbar(): ToolbarDecorator {
        val group = createCommonActionGroup(treeTable, addCopy = false).also {
            it.addAction(RefreshTreeAction(treeTable, rootNode))
        }
        return ToolbarDecorator.createDecorator(treeTable).setActionGroup(group)
    }

    // addCopy is here vs doing it in the `also`'s because it makes it easier to get actions in the right order
    private fun createCommonActionGroup(table: S3TreeTable, addCopy: Boolean): DefaultActionGroup = DefaultActionGroup().also {
        it.add(DownloadObjectAction(project, table))
        it.add(ViewObjectVersionAction(table))
        it.add(UploadObjectAction(project, table))
        it.add(Separator())
        it.add(NewFolderAction(project, table))
        it.add(
            RenameObjectAction(project, table).apply {
                registerCustomShortcutSet(CommonShortcuts.getRename(), table)
            }
        )
        if (addCopy) {
            it.add(object : ActionGroup(message("s3.copy.actiongroup.label"), null, AllIcons.Actions.Copy) {
                override fun isPopup(): Boolean = true
                override fun update(e: AnActionEvent) {
                    // Only enable it if we have some selection. We hide the root node so it means we have no selection if that is the node passed in
                    val selected = treeTable.getSelectedNodes().firstOrNull()
                    e.presentation.isEnabled = selected != null && selected != treeTable.rootNode
                }

                override fun getChildren(e: AnActionEvent?): Array<AnAction> = arrayOf(
                    CopyPathAction(project, table),
                    CopyUrlAction(project, table),
                    CopyUriAction(project, table)
                )
            })
        }
        it.add(DeleteObjectAction(project, table))
        it.add(Separator())
    }
}
