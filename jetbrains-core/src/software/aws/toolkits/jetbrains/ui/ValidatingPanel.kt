// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.BundleBase
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.ui.layout.Cell
import com.intellij.ui.layout.CellBuilder
import com.intellij.ui.layout.LayoutBuilder
import com.intellij.ui.layout.RowBuilder
import com.intellij.ui.layout.panel
import com.intellij.util.Alarm
import com.intellij.util.ui.components.BorderLayoutPanel
import software.aws.toolkits.jetbrains.core.utils.buildList
import java.awt.event.ActionEvent
import javax.swing.AbstractAction
import javax.swing.JButton
import javax.swing.JComponent

class ValidatingPanel internal constructor(
    parentDisposable: Disposable,
    private val contentPanel: DialogPanel,
    validatingButtons: Map<JButton, (event: ActionEvent) -> Unit>
) : BorderLayoutPanel() {
    private val disposable = Disposer.newDisposable(parentDisposable, this::class.java.name)
    private val validatingActions = createButtonActions(validatingButtons)

    // Used for the validateOnApply checking
    private val validateCallbacks = contentPanel.validateCallbacks.toList()
    private val validationAlarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, disposable)
    private var previousErrors = emptyList<ValidationInfo>()
    private var validatorStarted = false

    init {
        // Used for the validateOnInput checking
        contentPanel.registerValidators(disposable) { map ->
            updateActionButtons(map.isEmpty())
        }

        addToCenter(contentPanel)
    }

    private fun createButtonActions(buttons: Map<JButton, (event: ActionEvent) -> Unit>): List<ValidatingAction> = buildList(buttons.size) {
        buttons.forEach { (button, action) ->
            add(
                ValidatingAction(action).also {
                    button.hideActionText = true // Text is already configured on the button
                    button.action = it
                }
            )
        }
    }

    private fun updateActionButtons(panelIsValid: Boolean) {
        validatingActions.forEach { it.isEnabled = panelIsValid }
    }

    private fun performValidation(): List<ValidationInfo> {
        if (validateCallbacks.isNotEmpty()) {
            val result = mutableListOf<ValidationInfo>()
            for (callback in validateCallbacks) {
                callback.invoke()?.let {
                    result.add(it)
                }
            }
            return result
        }
        return emptyList()
    }

    private fun updateErrorInfo(info: List<ValidationInfo>) {
        val updateNeeded = previousErrors != info
        if (updateNeeded) {
            runOnUi {
                setErrorInfoAll(info)
                updateActionButtons(info.all { it.okEnabled })
            }
        }
    }

    fun getPreferredFocusedComponent(): JComponent? = contentPanel.preferredFocusedComponent

    private fun startTrackingValidation() {
        runOnUi {
            if (!validatorStarted) {
                validatorStarted = true
                initValidation()
            }
        }
    }

    private fun initValidation() {
        validationAlarm.cancelAllRequests()
        val validateRequest = Runnable {
            if (!isDisposed()) {
                updateErrorInfo(performValidation())
                initValidation()
            }
        }
        validationAlarm.addRequest(validateRequest, VALIDATION_INTERVAL_MS, ModalityState.stateForComponent(this))
    }

    private inner class ValidatingAction(private val listener: (ActionEvent) -> Unit) : AbstractAction() {
        override fun actionPerformed(e: ActionEvent) {
            val errorList = performValidation()
            if (errorList.isNotEmpty()) {
                // Give the first error focus
                val info = errorList.first()
                info.component?.let {
                    IdeFocusManager.getInstance(null).requestFocus(it, true)
                }

                updateErrorInfo(errorList)
                startTrackingValidation()
            } else {
                contentPanel.apply()
                listener.invoke(e)
            }
        }
    }

    private fun setErrorInfoAll(latestErrors: List<ValidationInfo>) {
        if (previousErrors == latestErrors) return

        // Remove corrected errors
        previousErrors.asSequence()
            .filterNot { latestErrors.contains(it) }
            .mapNotNull {
                it.component?.let { c ->
                    ComponentValidator.getInstance(c)?.orElseGet(null)
                }
            }
            .forEach { it.updateInfo(null) }

        previousErrors = latestErrors
        previousErrors.forEach {
            it.component?.let { c ->
                val validator = ComponentValidator.getInstance(c).orElseGet {
                    ComponentValidator(disposable).installOn(c)
                }

                validator.updateInfo(it)
            }
        }
    }

    private fun isDisposed(): Boolean = Disposer.isDisposed(disposable)

    private fun runOnUi(action: () -> Unit) {
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) {
            action()
        } else {
            application.invokeLater(action, ModalityState.stateForComponent(this)) { isDisposed() }
        }
    }

    private companion object {
        const val VALIDATION_INTERVAL_MS = 300
    }
}

interface ValidatingPanelBuilder : RowBuilder {
    fun Cell.validatingButton(text: String, actionListener: (event: ActionEvent) -> Unit): CellBuilder<JButton>
}

class ValidatingPanelBuilderImpl(private val contentBuilder: LayoutBuilder) :
    ValidatingPanelBuilder,
    RowBuilder by contentBuilder {
    internal val actions = mutableMapOf<JButton, (event: ActionEvent) -> Unit>()

    override fun Cell.validatingButton(text: String, actionListener: (event: ActionEvent) -> Unit): CellBuilder<JButton> {
        val button = JButton(BundleBase.replaceMnemonicAmpersand(text))
        actions[button] = actionListener
        return component(button)
    }

    fun build(parentDisposable: Disposable, contentPanel: DialogPanel): ValidatingPanel = ValidatingPanel(parentDisposable, contentPanel, actions)
}

fun validatingPanel(disposable: Disposable, init: ValidatingPanelBuilder.() -> Unit): ValidatingPanel {
    lateinit var builder: ValidatingPanelBuilderImpl
    val contentPanel = panel {
        builder = ValidatingPanelBuilderImpl(this)
        builder.init()
    }

    return builder.build(disposable, contentPanel)
}
