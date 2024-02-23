// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.settings

import com.intellij.icons.AllIcons
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.project.Project
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.resources.message

//  As the connection is project-level, we need to make this project-level too (we have different config for Sono vs SSO users)
class CodeWhispererConfigurable(private val project: Project) :
    BoundConfigurable(message("aws.settings.codewhisperer.configurable.title")),
    SearchableConfigurable {
    private val codeWhispererSettings
        get() = CodeWhispererSettings.getInstance()

    private val isSso: Boolean
        get() = CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.SSO

    override fun getId() = "aws.codewhisperer"

    override fun createPanel() = panel {
        val connect = project.messageBus.connect(disposable ?: error("disposable wasn't initialized by framework"))
        val invoke = isCodeWhispererEnabled(project)

        // TODO: can we remove message bus subscribe and solely use visible(boolean) / enabled(boolean), consider multi project cases
        row {
            label(message("aws.settings.codewhisperer.warning")).apply {
                component.icon = AllIcons.General.Warning
            }.apply {
                visible(!invoke)
                connect.subscribe(
                    ToolkitConnectionManagerListener.TOPIC,
                    object : ToolkitConnectionManagerListener {
                        override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                            visible(!isCodeWhispererEnabled(project))
                        }
                    }
                )
            }
        }

        row {
            checkBox(message("aws.settings.codewhisperer.include_code_with_reference")).apply {
                connect.subscribe(
                    ToolkitConnectionManagerListener.TOPIC,
                    object : ToolkitConnectionManagerListener {
                        override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                            enabled(isCodeWhispererEnabled(project) && !isSso)
                        }
                    }
                )
                enabled(invoke && !isSso)
                bindSelected(codeWhispererSettings::isIncludeCodeWithReference, codeWhispererSettings::toggleIncludeCodeWithReference)
            }
        }.rowComment(message("aws.settings.codewhisperer.include_code_with_reference.tooltip"))

        row {
            checkBox(message("aws.settings.codewhisperer.automatic_import_adder")).apply {
                connect.subscribe(
                    ToolkitConnectionManagerListener.TOPIC,
                    object : ToolkitConnectionManagerListener {
                        override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                            enabled(isCodeWhispererEnabled(project))
                        }
                    }
                )
                enabled(invoke)
                bindSelected(codeWhispererSettings::isImportAdderEnabled, codeWhispererSettings::toggleImportAdder)
            }
        }.rowComment(message("aws.settings.codewhisperer.automatic_import_adder.tooltip"))

        row {
            checkBox(message("aws.settings.codewhisperer.configurable.opt_out.title")).apply {
                connect.subscribe(
                    ToolkitConnectionManagerListener.TOPIC,
                    object : ToolkitConnectionManagerListener {
                        override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                            enabled(isCodeWhispererEnabled(project) && !isSso)
                        }
                    }
                )

                enabled(invoke && !isSso)

                if (isSso) {
                    bindSelected({ false }, {})
                } else {
                    bindSelected(codeWhispererSettings::isMetricOptIn, codeWhispererSettings::toggleMetricOptIn)
                }
            }
        }.rowComment(message("aws.settings.codewhisperer.configurable.opt_out.tooltip"))

        row {
            comment(message("aws.settings.codewhisperer.configurable.iam_identity_center.warning"))
        }.visible(isSso)
    }
}
