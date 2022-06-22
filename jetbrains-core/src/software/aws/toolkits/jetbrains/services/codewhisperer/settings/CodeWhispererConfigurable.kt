// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.settings

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.ui.layout.panel
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererActivationChangedListener
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

class CodeWhispererConfigurable :
    BoundConfigurable(message("aws.settings.codewhisperer.configurable.title")),
    SearchableConfigurable {
    private val codeWhispererSettings
        get() = CodeWhispererSettings.getInstance()

    override fun getId() = "aws.codewhisperer"

    override fun createPanel() = panel {
        val connect = ApplicationManager.getApplication().messageBus.connect()
        val invoke = CodeWhispererExplorerActionManager.getInstance()::hasAcceptedTermsOfService
        row {
            label(message("aws.settings.codewhisperer.warning")).apply {
                component.icon = AllIcons.General.Warning
            }.apply {
                visible(!invoke())
                connect.subscribe(
                    CodeWhispererExplorerActionManager.CODEWHISPERER_ACTIVATION_CHANGED,
                    object : CodeWhispererActivationChangedListener {
                        override fun activationChanged(value: Boolean) {
                            visible(!value)
                        }
                    }
                )
            }
        }
        row {
            checkBox(
                message("aws.settings.codewhisperer.include_code_with_reference"),
                codeWhispererSettings::isIncludeCodeWithReference,
                codeWhispererSettings::toggleIncludeCodeWithReference,
                message("aws.settings.codewhisperer.include_code_with_reference.tooltip")
            ).apply {
                enabled(invoke())
                connect.subscribe(
                    CodeWhispererExplorerActionManager.CODEWHISPERER_ACTIVATION_CHANGED,
                    object : CodeWhispererActivationChangedListener {
                        override fun activationChanged(value: Boolean) {
                            enabled(value)
                        }
                    }
                )
            }
        }
        row {
            checkBox(
                message("aws.settings.codewhisperer.configurable.opt_out.title"),
                codeWhispererSettings::isMetricOptIn,
                codeWhispererSettings::toggleMetricOptIn,
                message("aws.settings.codewhisperer.configurable.opt_out.tooltip")
            ).apply {
                enabled(invoke())
                connect.subscribe(
                    CodeWhispererExplorerActionManager.CODEWHISPERER_ACTIVATION_CHANGED,
                    object : CodeWhispererActivationChangedListener {
                        override fun activationChanged(value: Boolean) {
                            enabled(value)
                        }
                    }
                )
            }
        }
    }
}
