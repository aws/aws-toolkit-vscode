// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.DefaultComboBoxModel

class ResourceSelector<T> : ComboBox<T>() {

    private var loadingStatus: ResourceLoadingStatus = ResourceLoadingStatus.SUCCESSFUL

    var loadingException: Exception? = null
        private set

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
            this.isEnabled = false
            loadingStatus = ResourceLoadingStatus.LOADING

            val model = this.model as DefaultComboBoxModel<T>
            model.removeAllElements()

            val values = try {
                block().apply {
                    loadingException = null
                    loadingStatus = ResourceLoadingStatus.SUCCESSFUL
                }
            } catch (e: Exception) {
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
                    this.isEnabled = previousState
                }
            }, ModalityState.any())
        }
    }

    fun addAndSelectValue(updateStatus: Boolean = true, fetch: () -> T) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val previousState = this.isEnabled
            this.isEnabled = false
            loadingStatus = ResourceLoadingStatus.LOADING

            val value = try {
                fetch().apply {
                    loadingException = null
                    loadingStatus = ResourceLoadingStatus.SUCCESSFUL
                }
            } catch (e: Exception) {
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
                    this.isEnabled = previousState
                }
            }, ModalityState.any())
        }
    }

    fun toValidationInfo(loading: String = message("loading_resource.loading"), failed: String = message("loading_resource.failed"), notSelected: String): ValidationInfo? {
        if (this.selected() != null) {
            return null
        }
        return when (loadingStatus) {
            ResourceLoadingStatus.LOADING -> ValidationInfo(loading, this)
            ResourceLoadingStatus.FAILED -> ValidationInfo(loadingException?.message ?: failed, this)
            ResourceLoadingStatus.SUCCESSFUL -> ValidationInfo(notSelected, this)
        }
    }

    private enum class ResourceLoadingStatus {
        LOADING,
        FAILED,
        SUCCESSFUL
    }
}