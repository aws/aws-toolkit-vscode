// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ComboboxSpeedSearch
import com.intellij.ui.SimpleListCellRenderer
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.utils.ui.selected

/**
 * Combo box used to select a region
 * TODO: Determine the UX for the box, do we want to categorize?
 */
class RegionSelector : ComboBox<AwsRegion>() {
    private val comboBoxModel = CollectionComboBoxModel<AwsRegion>()

    init {
        model = comboBoxModel
        setRenderer(RENDERER) // use the setter, not protected field
        ComboboxSpeedSearch(this)
    }

    fun setRegions(regions: List<AwsRegion>) {
        comboBoxModel.replaceAll(regions)
    }

    var selectedRegion: AwsRegion?
        get() = selected()
        set(value) {
            selectedItem = if (comboBoxModel.items.contains(value)) {
                value
            } else {
                null
            }
        }

    companion object {
        private val RENDERER = SimpleListCellRenderer.create<AwsRegion>("") {
            it.displayName
        }
    }
}
