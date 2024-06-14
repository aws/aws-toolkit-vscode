// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.execution.configuration.EnvironmentVariablesData
import com.intellij.execution.util.EnvVariablesTable
import com.intellij.execution.util.EnvironmentVariable
import com.intellij.icons.AllIcons
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.UserActivityProviderComponent
import org.jetbrains.annotations.Nls
import software.aws.toolkits.resources.message
import java.awt.Component
import java.util.LinkedHashMap
import java.util.concurrent.CopyOnWriteArrayList
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.event.ChangeEvent
import javax.swing.event.ChangeListener
import javax.swing.event.DocumentEvent

/**
 * Our version of [com.intellij.execution.configuration.EnvironmentVariablesTextFieldWithBrowseButton].
 * It has been modified to support our use case of having a compact, generic key-value entry dialog.
 * Inheriting system env vars is not supported, but rest of UX is generally the same
 */
class KeyValueTextField(
    @Nls dialogTitle: String = message("environment.variables.dialog.title")
) : TextFieldWithBrowseButton(), UserActivityProviderComponent {
    private var data = EnvironmentVariablesData.create(emptyMap(), false)
    private val listeners = CopyOnWriteArrayList<ChangeListener>()

    var envVars: Map<String, String>
        get() = data.envs
        set(value) {
            data = EnvironmentVariablesData.create(value, false)
            text = stringify(data.envs)
        }

    init {
        addActionListener {
            EnvironmentVariablesDialog(this, dialogTitle).show()
        }

        textField.document.addDocumentListener(
            object : DocumentAdapter() {
                override fun textChanged(e: DocumentEvent) {
                    if (!StringUtil.equals(stringify(data.envs), text)) {
                        val textEnvs = EnvVariablesTable.parseEnvsFromText(text)
                        data = EnvironmentVariablesData.create(textEnvs, data.isPassParentEnvs)
                        fireStateChanged()
                    }
                }
            }
        )
    }

    private fun convertToVariables(envVars: Map<String, String>, readOnly: Boolean): List<EnvironmentVariable> = envVars.map { (key, value) ->
        object : EnvironmentVariable(key, value, readOnly) {
            override fun getNameIsWriteable(): Boolean = !readOnly
        }
    }

    override fun getDefaultIcon(): Icon = AllIcons.General.InlineVariables

    override fun getHoveredIcon(): Icon = AllIcons.General.InlineVariablesHover

    override fun addChangeListener(changeListener: ChangeListener) {
        listeners.add(changeListener)
    }

    override fun removeChangeListener(changeListener: ChangeListener) {
        listeners.remove(changeListener)
    }

    private fun fireStateChanged() {
        listeners.forEach {
            it.stateChanged(ChangeEvent(this))
        }
    }

    private fun stringify(envVars: Map<String, String>): String {
        if (envVars.isEmpty()) {
            return ""
        }

        return buildString {
            for ((key, value) in envVars) {
                if (isNotEmpty()) {
                    append(";")
                }
                append(StringUtil.escapeChar(key, ';'))
                append("=")
                append(StringUtil.escapeChar(value, ';'))
            }
        }
    }

    private inner class EnvironmentVariablesDialog(parent: Component, title: String) : DialogWrapper(parent, true) {
        private val envVarTable = EnvVariablesTable().apply {
            setValues(convertToVariables(data.envs, false))
            setPasteActionEnabled(true)
        }

        init {
            this.title = title
            init()
        }

        override fun createCenterPanel(): JComponent = envVarTable.component

        override fun doOKAction() {
            envVarTable.stopEditing()
            val newEnvVars = LinkedHashMap<String, String>()
            for (variable in envVarTable.environmentVariables) {
                newEnvVars[variable.name] = variable.value
            }
            envVars = newEnvVars
            super.doOKAction()
        }
    }
}
