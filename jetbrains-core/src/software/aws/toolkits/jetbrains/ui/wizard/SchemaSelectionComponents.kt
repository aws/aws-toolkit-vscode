// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.ui.SimpleTextAttributes
import icons.AwsIcons
import software.aws.toolkits.resources.message
import java.awt.Component
import java.awt.Insets
import javax.swing.JList

sealed class SchemaSelectionItem(val itemText: String) {
    class RegistryItem(val registryName: String) : SchemaSelectionItem(message("sam.init.schema.registry.name", registryName))
    class SchemaItem(val schemaName: String, val registryName: String) : SchemaSelectionItem(schemaName)

    override fun toString() = itemText
}

// Custom ComboBoxModel to disallow selection of a registry
class SchemaSelectionComboBoxModel : MutableCollectionComboBoxModel<SchemaSelectionItem>() {

    override fun setSelectedItem(item: Any?) {
        if (item is SchemaSelectionItem.RegistryItem) {
            val index = getElementIndex(item)
            if (index + 1 < size) {
                val nextSelected = getElementAt(index + 1)
                if (nextSelected != null) {
                    setSelectedItem(nextSelected)
                }
            }
        } else {
            super.setSelectedItem(item)
        }
    }
}

class SchemaSelectionListCellRenderer : ColoredListCellRenderer<SchemaSelectionItem>() {

    // Style registry cell items so that only Schemas themselves appear "selectable"
    override fun getListCellRendererComponent(
        list: JList<out SchemaSelectionItem>,
        value: SchemaSelectionItem?,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean
    ): Component = when (value) {
        is SchemaSelectionItem.SchemaItem -> {
            super.getListCellRendererComponent(list, value, index, selected, hasFocus)
        }
        else -> {
            super.getListCellRendererComponent(list, value, index, false, hasFocus)
        }
    }

    override fun customizeCellRenderer(
        list: JList<out SchemaSelectionItem>,
        value: SchemaSelectionItem?,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean
    ) {
        if (value == null) return

        val textAttributes = SimpleTextAttributes.REGULAR_ATTRIBUTES
        var icon = AwsIcons.Logos.EVENT_BRIDGE
        var insets = Insets(0, 0, 0, 0)

        when (value) {
            is SchemaSelectionItem.RegistryItem -> {
                icon = AwsIcons.Resources.SCHEMA_REGISTRY
            }
            is SchemaSelectionItem.SchemaItem -> {
                icon = AwsIcons.Resources.SCHEMA
                insets = Insets(0, 25, 0, 0)
            }
        }
        setIcon(icon)
        append(value.itemText, textAttributes)
        setIpad(insets)
    }
}
