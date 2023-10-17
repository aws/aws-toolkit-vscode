// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.customization

import com.intellij.notification.NotificationAction
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.actionListener
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.selected
import com.intellij.ui.dsl.builder.toNullableProperty
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import software.amazon.awssdk.arns.Arn
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_CUSTOM_LEARN_MORE_URI
import software.aws.toolkits.jetbrains.ui.AsyncComboBox
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JList

private val NoDataToDisplay = CustomizationUiItem(
    CodeWhispererCustomization("", message("codewhisperer.custom.dialog.option.no_data"), ""),
    false,
    false
)

private fun notifyCustomizationIsSelected(project: Project, customizationUiItem: CustomizationUiItem?) {
    val content = customizationUiItem?.let {
        "CodeWhisperer suggestions are now coming from the ${it.customization.name} customization"
    } ?: "CodeWhisperer suggestions are now coming from the ${message("codewhisperer.custom.dialog.option.default")}"

    notifyInfo(
        title = message("codewhisperer.custom.dialog.title"),
        content = content,
        project = project,
        notificationActions = listOf(
            NotificationAction.create(
                message("codewhisperer.notification.custom.simple.button.got_it")
            ) { _, notification -> notification.expire() }
        )
    )
}

/**
 * Please use CodeWhispererModelConfigurator.showConfigDialog() instead of init a dialog object directly, the reason is that we need to manage "New"
 * customizations compared to the previous snapshot in the CodeWhipsererModelConfigurator service and render in the UI. Initialize a dialog directly and show
 * will not have this metadata.
 *
 */
class CodeWhispererCustomizationDialog(
    private val project: Project,
    private val myCustomizations: List<CustomizationUiItem>? = null
) : DialogWrapper(project), Disposable {
    private data class Modal(
        var selectedOption: RadioButtonOption,
        var selectedCustomization: CustomizationUiItem?,
    )

    enum class RadioButtonOption {
        Default,
        Customization
    }

    private var modal: Modal
    private val panel: DialogPanel by lazy { drawPanel() }

    init {
        title = message("codewhisperer.custom.dialog.title")
        setOKButtonText(message("codewhisperer.custom.dialog.ok_button.text"))

        val selectedOption = CodeWhispererModelConfigurator.getInstance().activeCustomization(project)?.let {
            RadioButtonOption.Customization
        } ?: RadioButtonOption.Default

        modal = Modal(selectedOption, null)
        isOKActionEnabled = false

        init()
    }

    override fun doOKAction() {
        this.panel.apply()

        when (modal.selectedOption) {
            RadioButtonOption.Default -> run {
                CodeWhispererModelConfigurator.getInstance().switchCustomization(project, null)
                notifyCustomizationIsSelected(project, null)
            }

            RadioButtonOption.Customization -> run {
                CodeWhispererModelConfigurator.getInstance().switchCustomization(project, modal.selectedCustomization?.customization)
                notifyCustomizationIsSelected(project, modal.selectedCustomization)
            }
        }

        close(OK_EXIT_CODE)
    }

    override fun doCancelAction() {
        super.doCancelAction()

        // TODO: not using project.refreshDevToolTree is weird
        //  but the purpose is to update devTool trees of all IDE instances with CodeWhisperer IdC
        CodeWhispererCustomizationListener.notifyCustomUiUpdate()
        close(CANCEL_EXIT_CODE)
    }

    override fun dispose() {
        super.dispose()
    }

    override fun createCenterPanel(): JComponent = panel

    // TODO: check if we can render a multi-line combo box
    private fun drawPanel() = panel {
        row {
            label(message("codewhisperer.custom.dialog.panel.title")).bold()
        }

        lateinit var customizationButton: Cell<JBRadioButton>
        lateinit var defaultButton: Cell<JBRadioButton>
        lateinit var customizationComboBox: ComboBox<CustomizationUiItem>

        buttonsGroup {
            row {
                defaultButton = radioButton(message("codewhisperer.custom.dialog.option.default"), RadioButtonOption.Default)
                    .comment(message("codewhisperer.custom.dialog.model.default.comment"))
                    .actionListener { _, component ->
                        if (component.isSelected) {
                            isOKActionEnabled = CodeWhispererModelConfigurator.getInstance().activeCustomization(project) != null
                        }
                    }
            }.topGap(TopGap.MEDIUM)

            row {
                customizationButton = radioButton(message("codewhisperer.custom.dialog.option.customization"), RadioButtonOption.Customization)
                    .actionListener { _, component ->
                        if (component.isSelected) {
                            isOKActionEnabled =
                                customizationComboBox.item != null &&
                                CodeWhispererModelConfigurator.getInstance().activeCustomization(project) != customizationComboBox.item.customization &&
                                modal.selectedCustomization?.customization != NoDataToDisplay.customization
                        }
                    }
            }.topGap(TopGap.MEDIUM)

            lateinit var noCustomizationComment: Row
            lateinit var customizationComment: Row
            indent {
                noCustomizationComment = row("") {
                    rowComment(message("codewhisperer.custom.dialog.option.customization.description.no_customization", CODEWHISPERER_CUSTOM_LEARN_MORE_URI))
                }.visible(false)

                customizationComment = row("") {
                    rowComment(message("codewhisperer.custom.dialog.option.customization.description"))
                }.visible(false)
            }

            indent {
                row {
                    cell(AsyncComboBox<CustomizationUiItem>(customRenderer = CustomizationRenderer)).applyToComponent {
                        customizationComboBox = this
                        preferredSize.width = maxOf(preferredSize.width, 600)

                        proposeModelUpdate { model ->
                            val activeCustomization = CodeWhispererModelConfigurator.getInstance().activeCustomization(project)
                            val unsorted = myCustomizations ?: CodeWhispererModelConfigurator.getInstance().listCustomizations(project).orEmpty()

                            val sorted = activeCustomization?.let {
                                unsorted.putPickedUpFront(setOf(it))
                            } ?: run {
                                unsorted.sortedBy { it.customization.name }
                            }

                            if (
                                sorted.isNotEmpty() &&
                                sorted.first().customization != activeCustomization &&
                                modal.selectedOption == RadioButtonOption.Customization
                            ) {
                                isOKActionEnabled = true
                            }

                            if (sorted.isEmpty()) {
                                model.addElement(NoDataToDisplay)
                                noCustomizationComment.visible(true)
                                modal.selectedOption = RadioButtonOption.Default
                                defaultButton.component.isSelected = true
                                customizationButton.enabled(false)
                                getLogger<CodeWhispererCustomizationDialog>().debug { "Empty customization was found" }
                            } else {
                                customizationComment.visible(true)
                                sorted.forEach {
                                    model.addElement(it)
                                }
                            }

                            modal.selectedCustomization = model.selectedItem as CustomizationUiItem

                            addItemListener {
                                isOKActionEnabled = item.customization != CodeWhispererModelConfigurator.getInstance().activeCustomization(project) &&
                                    item.customization != NoDataToDisplay.customization
                            }
                        }
                    }
                        .bindItem(prop = modal::selectedCustomization.toNullableProperty())
                        .enabledIf(customizationButton.selected)
                        .horizontalAlign(HorizontalAlign.FILL)
                }
            }
        }.bind(modal::selectedOption)

        separator().topGap(TopGap.MEDIUM)
    }
}

private fun List<CustomizationUiItem>.putPickedUpFront(picked: Set<CodeWhispererCustomization>) = sortedWith { o1, o2 ->
    val has1 = picked.contains(o1.customization)
    val has2 = picked.contains(o2.customization)

    if (has1 && has2) {
        0
    } else if (has1) {
        -1
    } else if (has2) {
        1
    } else {
        naturalOrder<String>().compare(o1.customization.name, o2.customization.name)
    }
}

private object CustomizationRenderer : ColoredListCellRenderer<CustomizationUiItem>() {
    override fun customizeCellRenderer(
        list: JList<out CustomizationUiItem>,
        value: CustomizationUiItem?,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean
    ) {
        value?.let {
            append(it.customization.name, SimpleTextAttributes.REGULAR_ATTRIBUTES)

            if (it.shouldPrefixAccountId) {
                tryOrNull { Arn.fromString(it.customization.arn).accountId().get() }?.let { accountId ->
                    append(" ($accountId)", SimpleTextAttributes.REGULAR_ATTRIBUTES)
                }
            }

            if (it.isNew) {
                append("  New", SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES)
            }

            if (it != NoDataToDisplay) {
                val description = if (it.customization.description.isNullOrBlank()) {
                    message("codewhisperer.custom.dialog.customization.no_description")
                } else {
                    it.customization.description
                }

                append("  $description", SimpleTextAttributes.GRAYED_ATTRIBUTES)
            }
        }
    }
}
