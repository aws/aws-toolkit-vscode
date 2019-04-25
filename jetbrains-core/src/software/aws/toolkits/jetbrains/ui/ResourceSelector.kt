// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.DefaultComboBoxModel

class ResourceSelector<T> : ComboBox<T>() {

    var loadingStatus: ResourceLoadingStatus = ResourceLoadingStatus.SUCCESSFUL
        private set

    private var shouldBeEnabled: Boolean = isEnabled

    var loadingException: Exception? = null
        private set

    /**
     * Postpone the ComboBox enability changing when it is still in loading status. Ie. when the ComboBox is in
     * [ResourceLoadingStatus.LOADING]    - always disable it, and change to the desired status after successfully loaded.
     * [ResourceLoadingStatus.SUCCESSFUL] - same as the standard [setEnabled] behavior.
     * [ResourceLoadingStatus.FAILED]     - always disable it, and always set the desired status to false.
     */
    @Synchronized override fun setEnabled(enabled: Boolean) {
        shouldBeEnabled = when (loadingStatus) {
            ResourceLoadingStatus.SUCCESSFUL -> {
                super.setEnabled(enabled)
                enabled
            }
            ResourceLoadingStatus.LOADING -> {
                super.setEnabled(false)
                enabled
            }
            else -> {
                super.setEnabled(false)
                false
            }
        }
    }

    /**
     * @param default The default selected item
     * @param updateStatus If enabled, disable the combo box if the item collection is empty or enable it if the item collection
     * is not empty. Otherwise, the status of the combo box is not changed.
     * @param forceSelectDefault If disabled, override the [default] by selecting previously selected item if it
     * is not null, otherwise still falls back to select [default]
     * @param block Lambda function that returns a new set of items for the combo box.
     */
    fun populateValues(
        default: T? = null,
        updateStatus: Boolean = true,
        forceSelectDefault: Boolean = true,
        block: () -> Collection<T>
    ) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val previouslySelected = this.model.selectedItem
            val previousState = this.isEnabled
            loadingStatus = ResourceLoadingStatus.LOADING
            isEnabled = previousState

            val model = this.model as DefaultComboBoxModel<T>
            model.removeAllElements()

            val values = try {
                block().apply {
                    loadingException = null
                    loadingStatus = ResourceLoadingStatus.SUCCESSFUL
                }
            } catch (e: Exception) {
                // TODO: We need a way to inform people that this fails sooner then relying on the validation system to be running
                loadingException = e
                loadingStatus = ResourceLoadingStatus.FAILED
                null
            } ?: return@executeOnPooledThread

            ApplicationManager.getApplication().invokeLater({
                values.forEach { model.addElement(it) }
                this.selectedItem = if (forceSelectDefault || previouslySelected == null) default else previouslySelected
                if (updateStatus) {
                    this.isEnabled = values.isNotEmpty()
                } else {
                    this.isEnabled = shouldBeEnabled
                }
            }, ModalityState.any())
        }
    }

    fun addAndSelectValue(updateStatus: Boolean = true, fetch: () -> T) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val previousState = this.isEnabled
            loadingStatus = ResourceLoadingStatus.LOADING
            isEnabled = previousState

            val value = try {
                fetch().apply {
                    loadingException = null
                    loadingStatus = ResourceLoadingStatus.SUCCESSFUL
                }
            } catch (e: Exception) {
                LOG.warn(e) { "Failed to load values" }
                loadingException = e
                loadingStatus = ResourceLoadingStatus.FAILED
                null
            } ?: return@executeOnPooledThread

            ApplicationManager.getApplication().invokeLater({
                val model = this.model as DefaultComboBoxModel<T>
                model.addElement(value)
                model.selectedItem = value
                if (updateStatus) {
                    this.isEnabled = true
                } else {
                    this.isEnabled = shouldBeEnabled
                }
            }, ModalityState.any())
        }
    }

    fun toValidationInfo(loading: String = message("loading_resource.loading"), failed: String = message("loading_resource.failed"), notSelected: String): ValidationInfo? {
        if (this.selected() != null) {
            return null
        }
        // Error messages do not work on a disabled component. May be a JetBrains bug?
        // Revisit after https://github.com/aws/aws-toolkit-jetbrains/issues/726
        val component = if (super.isEnabled()) this else null
        return when (loadingStatus) {
            ResourceLoadingStatus.LOADING -> ValidationInfo(loading, component)
            ResourceLoadingStatus.FAILED -> ValidationInfo(loadingException?.message ?: failed, component)
            ResourceLoadingStatus.SUCCESSFUL -> ValidationInfo(notSelected, component)
        }
    }

    fun values(): Set<T> = (0 until itemCount).map { getItemAt(it) }.toSet()

    enum class ResourceLoadingStatus {
        LOADING,
        FAILED,
        SUCCESSFUL
    }

    private companion object {
        val LOG = getLogger<ResourceSelector<*>>()
    }
}