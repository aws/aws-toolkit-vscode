// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.util.ExceptionUtil
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.Either
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.resources.message
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletableFuture
import javax.swing.JList

private typealias Selector<T> = Either<Any?, (T) -> Boolean>

typealias AwsConnection = Pair<AwsRegion, ToolkitCredentialsProvider>
typealias LazyAwsConnectionEvaluator = () -> AwsConnection

@Suppress("UNCHECKED_CAST")
class ResourceSelector<T> private constructor(
    private val project: Project,
    private val resourceType: () -> Resource<out Collection<T>>?,
    comboBoxModel: MutableCollectionComboBoxModel<T>,
    customRenderer: ColoredListCellRenderer<T>?,
    loadOnCreate: Boolean,
    private val sortOnLoad: Boolean,
    private val awsConnection: LazyAwsConnectionEvaluator
) : ComboBox<T>(comboBoxModel) {

    private val resourceCache = AwsResourceCache.getInstance(project)
    @Volatile
    private var loadingStatus: Status = Status.NOT_LOADED
    private var shouldBeEnabled: Boolean = isEnabled
    private var selector: Selector<T>? = null
    @Volatile
    private var loadingFuture: CompletableFuture<*>? = null

    init {
        customRenderer?.let {
            setRenderer(customRenderer)
        }

        if (loadOnCreate) {
            reload()
        }
    }

    @JvmOverloads
    @Synchronized
    fun reload(forceFetch: Boolean = false) {
        val previouslySelected = model.selectedItem
        loadingStatus = Status.LOADING

        // If this reload will supersede a previous once, cancel it
        loadingFuture?.cancel(true)

        runInEdt(ModalityState.any()) {
            loadingStatus = Status.LOADING
            super.setEnabled(false)
            setEditable(true)

            super.setSelectedItem(message("loading_resource.loading"))

            val resource = resourceType.invoke()
            if (resource == null) {
                processSuccess(emptyList(), null)
            } else {
                val (region, credentials) = awsConnection()
                val resultFuture = resourceCache.getResource(resource, region, credentials, forceFetch = forceFetch).toCompletableFuture()
                loadingFuture = resultFuture
                resultFuture.whenComplete { value, error ->
                    when {
                        error is CancellationException -> {
                        } // Do nothing, results don't matter
                        error != null -> processFailure(error)
                        value != null -> processSuccess(value, previouslySelected)
                    }
                }
            }
        }
    }

    override fun getModel(): MutableCollectionComboBoxModel<T> =
    // javax.swing.DefaultComboBoxModel.addAll(java.util.Collection<? extends E>) isn't in Java 8
    // The addElement method can lead to multiple selection events firing as elements are added
        // Use IntelliJ's to work around this short coming
        super.getModel() as MutableCollectionComboBoxModel<T>

    @Suppress("UNCHECKED_CAST")
    fun selected(): T? = if (loadingStatus == Status.LOADED) this.selectedItem as? T else null

    override fun setSelectedItem(item: Any?) {
        selector = Either.Left(item)

        if (item == null) {
            // TODO: Do we need to clear previouslySelected?
            super.setSelectedItem(null)
        } else {
            if (loadingStatus == Status.LOADED) {
                super.setSelectedItem(item)
            }
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
            super.setSelectedItem(model.find(matcher))
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

    val isLoading: Boolean
        get() = loadingStatus == Status.LOADING

    @TestOnly
    fun forceLoaded() {
        loadingStatus = Status.LOADED
    }

    private fun processSuccess(value: Collection<T>, previouslySelected: Any?) {
        runInEdt(ModalityState.any()) {
            setEditable(false)

            if (sortOnLoad) {
                model.replaceAll(value.sortedBy { it.toString().toLowerCase() })
            } else {
                model.replaceAll(value.toList())
            }
            loadingStatus = Status.LOADED

            super.setEnabled(shouldBeEnabled)

            when {
                value.isEmpty() -> super.setSelectedItem(null)
                value.size == 1 -> super.setSelectedItem(value.first())
                else -> super.setSelectedItem(determineSelection(selector, previouslySelected))
            }
        }
    }

    private fun processFailure(error: Throwable) {
        val message = message("loading_resource.failed")
        LOG.warn(error) { message }
        runInEdt(ModalityState.any()) {
            loadingStatus = Status.NOT_LOADED
            super.setSelectedItem(message)
            notifyError(message, ExceptionUtil.getThrowableText(error), project)
            val validationInfo = ValidationInfo(error.message ?: message, this)
            ComponentValidator.createPopupBuilder(validationInfo, null)
                .setCancelOnClickOutside(true)
                .createPopup()
                .showUnderneathOf(this)
        }
    }

    private fun determineSelection(selector: Selector<T>?, previouslySelected: Any?): Any? = when (selector) {
        is Either.Right<(T) -> Boolean> -> model.find(selector.value)
        is Either.Left<*> -> selector.value
        else -> previouslySelected
    }

    private enum class Status {
        NOT_LOADED,
        LOADING,
        LOADED
    }

    companion object {
        private val LOG = getLogger<ResourceSelector<*>>()
        @JvmStatic
        fun builder(project: Project) = object : ResourceBuilder {
            override fun <T> resource(resource: (() -> Resource<out Collection<T>>?)): ResourceBuilderOptions<T> = ResourceBuilderOptions(project, resource)
        }
    }

    interface ResourceBuilder {
        fun <T> resource(resource: Resource<out Collection<T>>): ResourceBuilderOptions<T> = resource { resource }
        fun <T> resource(resource: (() -> Resource<out Collection<T>>?)): ResourceBuilderOptions<T>
    }

    class ResourceBuilderOptions<T> internal constructor(private val project: Project, private val resource: (() -> Resource<out Collection<T>>?)) {
        private var loadOnCreate = true
        private var sortOnLoad = true
        private var comboBoxModel: MutableCollectionComboBoxModel<T> = MutableCollectionComboBoxModel<T>()
        private var customRendererFunction: ((T, ColoredListCellRenderer<T>) -> ColoredListCellRenderer<T>)? = null
        private var customRenderer: ColoredListCellRenderer<T>? = null
        private var awsConnection: LazyAwsConnectionEvaluator? = null

        fun comboBoxModel(comboBoxModel: MutableCollectionComboBoxModel<T>): ResourceBuilderOptions<T> = also {
            it.comboBoxModel = comboBoxModel
        }

        fun customRenderer(customRenderer: (T, ColoredListCellRenderer<T>) -> ColoredListCellRenderer<T>): ResourceBuilderOptions<T> = also {
            if (it.customRenderer != null) {
                throw IllegalStateException("Please specify either of the customRenderer factory methods, but not both")
            }
            it.customRendererFunction = customRenderer
        }

        fun customRenderer(customRenderer: ColoredListCellRenderer<T>): ResourceBuilderOptions<T> = also {
            if (it.customRendererFunction != null) {
                throw IllegalStateException("Please specify either of the customRenderer factory methods, but not both")
            }
            it.customRenderer = customRenderer
        }

        private fun resolveCustomRenderer(): ColoredListCellRenderer<T>? = customRenderer ?: customRendererFunction?.let { renderer ->
            object : ColoredListCellRenderer<T>() {
                override fun customizeCellRenderer(
                    list: JList<out T>,
                    value: T?,
                    index: Int,
                    selected: Boolean,
                    hasFocus: Boolean
                ) {
                    value?.let {
                        renderer.invoke(it, this)
                    }
                }
            }
        }

        fun disableAutomaticLoading(): ResourceBuilderOptions<T> = also { it.loadOnCreate = false }

        fun disableAutomaticSorting(): ResourceBuilderOptions<T> = also { it.sortOnLoad = false }

        fun awsConnection(awsConnection: AwsConnection): ResourceBuilderOptions<T> = awsConnection { awsConnection }

        fun awsConnection(awsConnection: LazyAwsConnectionEvaluator): ResourceBuilderOptions<T> = also {
            it.awsConnection = awsConnection
        }

        fun build() = ResourceSelector(project, resource, comboBoxModel, resolveCustomRenderer(), loadOnCreate, sortOnLoad, awsConnection ?: {
            val settings = ProjectAccountSettingsManager.getInstance(project)
            settings.activeRegion to settings.activeCredentialProvider
        })
    }
}
