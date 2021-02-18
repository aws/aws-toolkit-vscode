// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.icons.AllIcons
import com.intellij.ide.DataManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SideBorder
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
import software.aws.toolkits.jetbrains.services.s3.objectActions.RefreshTreeAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.RenameObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.UploadObjectAction
import software.aws.toolkits.jetbrains.services.s3.objectActions.ViewObjectVersionAction
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingConstants
import javax.swing.table.DefaultTableCellRenderer

class S3ViewerPanel(disposable: Disposable, private val project: Project, virtualBucket: S3VirtualBucket) {
    val component: JComponent
    val treeTable: S3TreeTable

    init {
        component = JPanel(BorderLayout())

        treeTable = createTreeTable(disposable, virtualBucket)
        val toolbarComponent = createToolbar(treeTable).component
        toolbarComponent.border = IdeBorderFactory.createBorder(SideBorder.TOP)

        PopupHandler.installPopupHandler(
            treeTable,
            createCommonActionGroup(treeTable, addCopy = true),
            ActionPlaces.UNKNOWN,
        )

        DataManager.registerDataProvider(component) {
            when {
                S3EditorDataKeys.SELECTED_NODES.`is`(it) -> treeTable.getSelectedNodes()
                S3EditorDataKeys.BUCKET_TABLE.`is`(it) -> treeTable
                else -> null
            }
        }

        component.add(ScrollPaneFactory.createScrollPane(treeTable), BorderLayout.CENTER)
        component.add(toolbarComponent, BorderLayout.SOUTH)
    }

    private fun createTreeTable(disposable: Disposable, virtualBucket: S3VirtualBucket): S3TreeTable {
        val rootNode = S3TreeDirectoryNode(virtualBucket, null, "")
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
            it.setRootVisible(false)
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
        val group = createCommonActionGroup(s3TreeTable, addCopy = false)
        val toolbar = ActionManager.getInstance().createActionToolbar(ActionPlaces.UNKNOWN, group, true)
        toolbar.setTargetComponent(s3TreeTable)
        return toolbar
    }

    // addCopy is here vs doing it in the `also`'s because it makes it easier to get actions in the right order
    private fun createCommonActionGroup(table: S3TreeTable, addCopy: Boolean): DefaultActionGroup = DefaultActionGroup().also {
        it.add(DownloadObjectAction())
        it.add(UploadObjectAction())
        it.add(Separator())
        it.add(ViewObjectVersionAction())
        it.add(Separator())
        it.add(NewFolderAction())
        it.add(
            RenameObjectAction().apply {
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
                    CopyPathAction(),
                    CopyUrlAction(),
                    CopyUriAction()
                )
            })
        }
        it.add(DeleteObjectAction())
        it.add(Separator())
        it.add(RefreshTreeAction())
    }
}
