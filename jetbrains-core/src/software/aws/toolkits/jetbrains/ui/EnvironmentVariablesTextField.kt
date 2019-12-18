// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.execution.configuration.EnvironmentVariablesData
import com.intellij.execution.util.EnvVariablesTable
import com.intellij.execution.util.EnvironmentVariable
import com.intellij.icons.AllIcons
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import software.aws.toolkits.resources.message
import java.awt.Component
import java.util.LinkedHashMap
import javax.swing.Icon
import javax.swing.JComponent

/**
 * Our version of [com.intellij.execution.configuration.EnvironmentVariablesTextFieldWithBrowseButton] to fit our
 * needs but with same UX so users are used to it. Namely we do not support inheriting system env vars, but rest
 * of UX is the same
 */
class EnvironmentVariablesTextField : TextFieldWithBrowseButton() {
    private var data = EnvironmentVariablesData.create(emptyMap(), false)
    var envVars: Map<String, String>
        get() = data.envs
        set(value) {
            data = EnvironmentVariablesData.create(value, false)
            text = stringify(data.envs)
        }

    init {
        isEditable = false
        addActionListener {
            EnvironmentVariablesDialog(this).show()
        }
    }

    private fun convertToVariables(envVars: Map<String, String>, readOnly: Boolean): List<EnvironmentVariable> = envVars.map { (key, value) ->
        object : EnvironmentVariable(key, value, readOnly) {
            override fun getNameIsWriteable(): Boolean = !readOnly
        }
    }

    override fun getDefaultIcon(): Icon = AllIcons.General.InlineVariables

    override fun getHoveredIcon(): Icon = AllIcons.General.InlineVariablesHover

    private fun stringify(envVars: Map<String, String>): String {
        if (envVars.isEmpty()) {
            return ""
        }

        val buf = StringBuilder()
        for ((key, value) in envVars) {
            if (buf.isNotEmpty()) {
                buf.append(";")
            }
            buf.append(key).append("=").append(value)
        }

        return buf.toString()
    }

    private inner class EnvironmentVariablesDialog(parent: Component) : DialogWrapper(parent, true) {
        private val envVarTable = EnvVariablesTable().apply {
            setValues(convertToVariables(data.envs, false))
            setPasteActionEnabled(true)
        }

        init {
            title = message("environment.variables.dialog.title")
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
