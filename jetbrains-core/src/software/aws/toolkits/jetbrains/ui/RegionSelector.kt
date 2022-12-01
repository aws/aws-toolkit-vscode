// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ComboboxSpeedSearch
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.layout.Cell
import com.intellij.ui.layout.CellBuilder
import com.intellij.ui.layout.PropertyBinding
import com.intellij.ui.layout.applyToComponent
import com.intellij.ui.layout.toBinding
import com.intellij.ui.layout.toNullable
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.ui.selected
import kotlin.reflect.KMutableProperty0

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

        /**
         * @param serviceId If specified, will filter the list of regions down to only the regions that support the specified service
         */
        fun Cell.regionSelector(prop: KMutableProperty0<AwsRegion>, serviceId: String? = null): CellBuilder<ComboBox<AwsRegion>> =
            regionSelector(prop.toBinding(), serviceId)

        fun Cell.regionSelector(binding: PropertyBinding<AwsRegion>, serviceId: String? = null): CellBuilder<ComboBox<AwsRegion>> {
            val regionProvider = AwsRegionProvider.getInstance()
            val regions = when {
                serviceId != null -> regionProvider.allRegionsForService(serviceId).values.toMutableList()
                else -> regionProvider.allRegions().values.toMutableList()
            }
            val model = CollectionComboBoxModel(regions)
            return comboBox(model, binding.toNullable(), RENDERER).applyToComponent {
                ComboboxSpeedSearch(this)
            }
        }
    }
}
