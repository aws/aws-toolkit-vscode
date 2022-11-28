// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.settings

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.project.Project
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererActivationChangedListener
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

//  As the connection is project-level, we need to make this project-level too (we have different config for Sono vs SSO users)
class CodeWhispererConfigurable(private val project: Project) :
    BoundConfigurable(message("aws.settings.codewhisperer.configurable.title")),
    SearchableConfigurable {
    private val codeWhispererSettings
        get() = CodeWhispererSettings.getInstance()

    override fun getId() = "aws.codewhisperer"

    // TODO: add a label reminding SSO users setting is controled by admin users
    override fun createPanel() = panel {
        val connect = ApplicationManager.getApplication().messageBus.connect()
        val invoke = CodeWhispererExplorerActionManager.getInstance()::hasAcceptedTermsOfService
        val isSso = CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.SSO

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
            checkBox(message("aws.settings.codewhisperer.include_code_with_reference")).apply {
                connect.subscribe(
                    CodeWhispererExplorerActionManager.CODEWHISPERER_ACTIVATION_CHANGED,
                    object : CodeWhispererActivationChangedListener {
                        override fun activationChanged(value: Boolean) {
                            enabled(value)
                        }
                    }
                )
                enabled(invoke() && !isSso)
                bindSelected(codeWhispererSettings::isIncludeCodeWithReference, codeWhispererSettings::toggleIncludeCodeWithReference)
            }
        }.rowComment(message("aws.settings.codewhisperer.include_code_with_reference.tooltip"))

        row {
            checkBox(message("aws.settings.codewhisperer.configurable.opt_out.title")).apply {
                connect.subscribe(
                    CodeWhispererExplorerActionManager.CODEWHISPERER_ACTIVATION_CHANGED,
                    object : CodeWhispererActivationChangedListener {
                        override fun activationChanged(value: Boolean) {
                            enabled(value)
                        }
                    }
                )
                enabled(invoke() && !isSso)
                bindSelected(codeWhispererSettings::isMetricOptIn, codeWhispererSettings::toggleMetricOptIn)
            }
        }.rowComment(message("aws.settings.codewhisperer.configurable.opt_out.tooltip"))

        row {
            comment(message("aws.settings.codewhisperer.configurable.iam_identity_center.warning"))
        }.visible(isSso)
    }
}
