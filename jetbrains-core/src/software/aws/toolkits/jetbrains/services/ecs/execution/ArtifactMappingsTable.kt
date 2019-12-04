// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.util.ListTableWithButtons
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.util.ui.ListTableModel
import software.aws.toolkits.jetbrains.ui.LocalPathProjectBaseCellEditor
import software.aws.toolkits.resources.message
import javax.swing.table.TableCellEditor

class ArtifactMappingsTable(private val project: Project) : ListTableWithButtons<ArtifactMapping>() {
    private val pathCellEditor = LocalPathProjectBaseCellEditor(project)
        .normalizePath(true)
        .fileChooserDescriptor(FileChooserDescriptorFactory.createSingleFileDescriptor())
    override fun isEmpty(element: ArtifactMapping): Boolean = element.localPath.isNullOrEmpty() ||
        element.remotePath.isNullOrEmpty()

    override fun cloneElement(variable: ArtifactMapping): ArtifactMapping = variable.copy()

    override fun canDeleteElement(selection: ArtifactMapping): Boolean = true

    override fun createElement(): ArtifactMapping = ArtifactMapping()

    fun getArtifactMappings(): List<ArtifactMapping> = elements.toList()

    override fun createListModel(): ListTableModel<*> = ListTableModel<ArtifactMapping>(
        StringColumnInfo(
            message("cloud_debug.ecs.run_config.container.artifacts.local"),
            { it.localPath },
            { mapping, value -> mapping.localPath = value },
            { pathCellEditor }
        ),
        StringColumnInfo(
            message("cloud_debug.ecs.run_config.container.artifacts.remote"),
            { it.remotePath },
            { mapping, value -> mapping.remotePath = value }
        )
    )

    private inner class StringColumnInfo(
        name: String,
        private val retrieveFunc: (ArtifactMapping) -> String?,
        private val setFunc: (ArtifactMapping, String?) -> Unit,
        private val editor: () -> TableCellEditor? = { null }
    ) : ListTableWithButtons.ElementsColumnInfoBase<ArtifactMapping>(name) {
        override fun valueOf(item: ArtifactMapping): String? = retrieveFunc.invoke(item)

        override fun setValue(item: ArtifactMapping, value: String?) {
            if (value == valueOf(item)) {
                return
            }
            setFunc.invoke(item, value)
            setModified()
        }

        override fun getDescription(item: ArtifactMapping): String? = null

        override fun isCellEditable(item: ArtifactMapping): Boolean = true

        override fun getEditor(item: ArtifactMapping): TableCellEditor? = editor()
    }
}
