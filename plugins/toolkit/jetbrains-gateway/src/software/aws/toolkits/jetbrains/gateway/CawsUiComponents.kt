// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.openapi.Disposable
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.util.BuildNumber
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SeparatorWithText
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.dsl.builder.BottomGap
import com.intellij.ui.dsl.builder.COLUMNS_LARGE
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.toNullableProperty
import com.jetbrains.gateway.ssh.IntelliJPlatformProduct
import software.amazon.awssdk.services.codecatalyst.model.InstanceType
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints
import software.aws.toolkits.jetbrains.services.caws.EnvironmentParameters
import software.aws.toolkits.jetbrains.services.caws.InactivityTimeout
import software.aws.toolkits.jetbrains.services.caws.isSupportedInFreeTier
import software.aws.toolkits.jetbrains.ui.AsyncComboBox
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.DefaultComboBoxModel
import javax.swing.JList
import kotlin.reflect.KMutableProperty0

sealed interface GatewayProductComboBoxItem {
    val item: GatewayProduct?
}

internal sealed interface SeparatorItem : GatewayProductComboBoxItem {
    val text: String

    override val item: GatewayProduct?
        get() = null
}

@JvmInline internal value class GatewayProductItem(override val item: GatewayProduct) : GatewayProductComboBoxItem

@JvmInline internal value class GenericTextItem(override val text: String) : SeparatorItem

@JvmInline internal value class ProductSeparatorItem(val productCode: String) : SeparatorItem {
    override val text: String
        get() = IntelliJPlatformProduct.fromProductCode(productCode)?.ideName ?: productCode
}

fun Row.ideVersionComboBox(disposable: Disposable, product: KMutableProperty0<GatewayProduct?>): Cell<ComboBox<GatewayProductComboBoxItem>> {
    val model = object : DefaultComboBoxModel<GatewayProductComboBoxItem>() {
        override fun setSelectedItem(anObject: Any?) {
            if (anObject !is GatewayProductItem) {
                return
            }
            super.setSelectedItem(anObject)
        }
    }

    val comboBox = AsyncComboBox(
        model,
        customRenderer = object : ColoredListCellRenderer<GatewayProductComboBoxItem>() {
            override fun getListCellRendererComponent(
                list: JList<out GatewayProductComboBoxItem>?,
                value: GatewayProductComboBoxItem?,
                index: Int,
                selected: Boolean,
                hasFocus: Boolean
            ): Component {
                if (value is SeparatorItem) {
                    return SeparatorWithText().apply {
                        caption = value.text
                        setCaptionCentered(value is GenericTextItem)
                    }
                }

                return super.getListCellRendererComponent(list, value, index, selected, hasFocus)
            }

            override fun customizeCellRenderer(
                list: JList<out GatewayProductComboBoxItem>,
                value: GatewayProductComboBoxItem?,
                index: Int,
                selected: Boolean,
                hasFocus: Boolean
            ) {
                val item = (value as? GatewayProductItem)?.item ?: return
                append(item.fullName)
                icon = IntelliJPlatformProduct.fromProductCode(item.productCode)?.icon
            }
        }
    )
    Disposer.register(disposable, comboBox)

    // hack so property bindings don't null out the provided initial value
    val initialProduct = product.get()?.also {
        model.addElement(GatewayProductItem(it))
        comboBox.selectedItem = it
    }

    comboBox.proposeModelUpdate { _ ->
        gatewayManifest().let { manifest ->
            val sortedProducts = manifest.images
                .sortedWith(
                    compareByDescending<GatewayProduct> { it.tags.firstOrNull() }
                        .thenBy { if (it.productCode == "IU") "" else it.productCode }
                        .thenByDescending {
                            BuildNumber.fromStringOrNull(it.buildNumber)
                        }
                )

            val currentProduct = if (initialProduct != null) {
                // try to match against something on the manifest, otherwise fall back to service response
                manifest.images.firstOrNull {
                    (it.productCode == initialProduct.productCode && it.buildNumber == initialProduct.buildNumber) ||
                        it.ecrImage == initialProduct.ecrImage
                } ?: initialProduct
            } else {
                sortedProducts.firstOrNull { it.productCode == "IU" } ?: sortedProducts.firstOrNull()
            }

            currentProduct?.let {
                if (!sortedProducts.contains(it)) {
                    model.addElement(GatewayProductItem(it))
                }
            }

            sortedProducts.forEachIndexed { index, gatewayProduct ->

                if (index == 0 || sortedProducts[index - 1].productCode != gatewayProduct.productCode) {
                    model.addElement(ProductSeparatorItem(gatewayProduct.productCode))
                }
                model.addElement(GatewayProductItem(gatewayProduct))
            }

            model.selectedItem = currentProduct?.let { GatewayProductItem(it) }
        }
    }

    return cell(comboBox)
        .bindItem({ product.get()?.let { GatewayProductItem(it) } }, { product.set(it?.item) })
        .columns(COLUMNS_LARGE)
        .errorOnApply(message("caws.ide_version_validation_text")) { it.selectedItem == null }
}

fun Panel.cawsEnvironmentSize(
    environmentParameters: EnvironmentParameters,
    instanceType: KMutableProperty0<InstanceType>,
    freeSubscriptionTier: Boolean
) {
    row {
        browserLink(message("caws.environment.view_pricing"), CawsEndpoints.ConsoleFactory.pricing())
    }

    row {
        label(message("caws.workspace.instance_size"))
    }

    buttonsGroup {
        val instanceRow = { label: String, type: InstanceType, text: String ->
            twoColumnsRow(
                {
                    radioButton(label)
                        .applyToComponent {
                            isSelected = instanceType.get() == type
                            isEnabled = if (freeSubscriptionTier) type.isSupportedInFreeTier() else true
                        }
                        .bindSelected(
                            { instanceType.get() == type },
                            { if (it) instanceType.set(type) }
                        )
                },
                {
                    comment(text, maxLineLength = -1)
                }
            )
        }

        lateinit var lastRow: Row
        environmentParameters.instanceTypes.forEach { (type, parameters) ->
            // TODO: Velox to provide API for this info
            val typeLabel = type.toString().substringAfter("dev.standard1.").capitalize()
            lastRow = instanceRow(typeLabel, type, "${parameters.vCpus} vCPUs, ${parameters.ram.value} GB RAM")
        }
        lastRow.bottomGap(BottomGap.MEDIUM)
    }
}

fun Row.cawsEnvironmentTimeout(timeout: KMutableProperty0<InactivityTimeout>) {
    label(message("caws.workspace.details.inactivity_timeout"))
    val values = InactivityTimeout.DEFAULT_VALUES.let {
        val currentTimeout = timeout.get()

        return@let if (!it.contains(currentTimeout)) {
            (it + currentTimeout).sortedArray()
        } else {
            it
        }
    }
    val model = DefaultComboBoxModel(values)

    comboBox(
        model,
        object : ColoredListCellRenderer<InactivityTimeout>() {
            override fun customizeCellRenderer(
                list: JList<out InactivityTimeout>,
                value: InactivityTimeout?,
                index: Int,
                selected: Boolean,
                hasFocus: Boolean
            ) {
                if (value == null) return

                append(value.displayText())

                if (value == InactivityTimeout.DEFAULT_TIMEOUT) {
                    append(" ")
                    append(message("general.default"), SimpleTextAttributes.GRAYED_ATTRIBUTES)
                }
            }
        }
    ).bindItem(timeout.toNullableProperty())
}
