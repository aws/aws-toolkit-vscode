// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.ExceptionUtil
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.Either
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.utils.CompatibilityUtils
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.resources.message
import javax.swing.DefaultComboBoxModel

typealias Selector<T> = Either<Any?, (T) -> Boolean>

class ResourceSelector<T>(private val project: Project, private val resourceType: Resource<out Collection<T>>) : ComboBox<T>() {

    private val resourceCache = AwsResourceCache.getInstance(project)
    private val actualModel = this.model as DefaultComboBoxModel<T>
    @Volatile
    private var loadingStatus: Status = Status.NOT_LOADED
    private var shouldBeEnabled: Boolean = isEnabled
    private var selector: Selector<T>? = null

    init {
        if (isEnabled) {
            reload()
        }
    }

    @JvmOverloads
    @Synchronized
    fun reload(forceFetch: Boolean = false) {
        val previouslySelected = actualModel.selectedItem
        loadingStatus = Status.LOADING
        runInEdt(ModalityState.any()) {
            super.setEnabled(false)
            setEditable(true)
            super.setSelectedItem(message("loading_resource.loading"))

            resourceCache.getResource(resourceType, forceFetch = forceFetch).whenComplete { value, error ->
                when {
                    value != null -> processSuccess(value, previouslySelected)
                    error != null -> processFailure(error)
                }
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun selected(): T? = if (loadingStatus == Status.LOADED) this.selectedItem as? T else null

    override fun setSelectedItem(item: Any?) {
        selector = Either.Left(item)
        if (loadingStatus == Status.LOADED) {
            super.setSelectedItem(item)
        }
    }

    /**
     * Should be used when a filter expression can be applied to find which item should be selected.
     * Useful when the loaded type is more complex than a string (e.g. you have an id and want to
     * select the resource that has that id).
     */
    fun selectedItem(matcher: (T) -> Boolean) {
        selector = Either.Right(matcher)
        if (loadingStatus == Status.LOADED) {
            super.setSelectedItem(actualModel.find(matcher))
        }
    }

    @Synchronized
    override fun setEnabled(enabled: Boolean) {
        shouldBeEnabled = enabled
        when {
            loadingStatus == Status.LOADED || !enabled -> super.setEnabled(enabled)
            loadingStatus == Status.NOT_LOADED -> reload()
        }
    }

    @TestOnly
    fun forceLoaded() {
        loadingStatus = Status.LOADED
    }

    private fun processSuccess(value: Collection<T>, previouslySelected: Any?) {
        runInEdt(ModalityState.any()) {
            loadingStatus = Status.LOADED
            setEditable(false)
            actualModel.removeAllElements()
            value.sortedBy { it.toString().toLowerCase() }.forEach { actualModel.addElement(it) }
            super.setEnabled(shouldBeEnabled)
            super.setSelectedItem(determineSelection(selector, previouslySelected))
        }
    }

    private fun processFailure(error: Throwable) {
        val message = message("loading_resource.failed")
        LOG.warn(error) { message }
        runInEdt(ModalityState.any()) {
            loadingStatus = Status.NOT_LOADED
            super.setSelectedItem(message)
            notifyError(message, ExceptionUtil.getThrowableText(error), project)
            CompatibilityUtils.createPopupBuilder(ValidationInfo(error.message ?: message, this), null)?.createPopup()?.showUnderneathOf(this)
        }
    }

    private fun determineSelection(selector: Selector<T>?, previouslySelected: Any?): Any? = when (selector) {
        is Either.Right<(T) -> Boolean> -> actualModel.find(selector.value)
        is Either.Left<*> -> selector.value
        else -> previouslySelected
    }

    private enum class Status {
        NOT_LOADED,
        LOADING,
        LOADED
    }

    private companion object {
        val LOG = getLogger<ResourceSelector<*>>()
    }
}