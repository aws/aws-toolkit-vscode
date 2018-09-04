// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ListCellRendererWrapper
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.utils.ui.selected
import javax.swing.JList

/**
 * Combo box used to select a region
 * TODO: Determine the UX for the box, do we want to categorize?
 */
class RegionSelector : ComboBox<AwsRegion>() {
    private val comboBoxModel = object : CollectionComboBoxModel<AwsRegion>() {
        fun setItems(newItems: List<AwsRegion>) {
            internalList.apply {
                clear()
                addAll(newItems)
            }
        }
    }

    init {
        model = comboBoxModel
        setRenderer(Renderer()) // use the setter, not protected field
    }

    var regions: List<AwsRegion>
        get() {
            return comboBoxModel.toList()
        }
        set(value) {
            comboBoxModel.items = value
        }

    var selectedRegion: AwsRegion?
        get() {
            return selected()
        }
        set(value) {
            selectedItem = value
        }

    private inner class Renderer : ListCellRendererWrapper<AwsRegion>() {
        override fun customize(list: JList<*>?, value: AwsRegion, index: Int, selected: Boolean, hasFocus: Boolean) {
            setText(value.displayName)
        }
    }
}
