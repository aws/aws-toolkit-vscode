// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.layout.selected
import software.aws.toolkits.resources.message

class AwsSettingsSharedConfigurable : BoundConfigurable("AWS"), SearchableConfigurable {
    val enableTelemetry: JBCheckBox = JBCheckBox(message("aws.settings.telemetry.option"))
    private val enableAutoUpdate: JBCheckBox = JBCheckBox(message("aws.settings.auto_update.text"))
    private val enableAutoUpdateNotification: JBCheckBox = JBCheckBox(message("aws.settings.auto_update.notification_enable.text"))
    override fun createPanel() = panel {
        group(message("aws.settings.global_label")) {
            row {
                cell(enableTelemetry).bindSelected(
                    AwsSettings.getInstance()::isTelemetryEnabled,
                    AwsSettings.getInstance()::isTelemetryEnabled::set
                )
                text("<a>${message("general.details")}</a>") {
                    BrowserUtil.open("https://docs.aws.amazon.com/sdkref/latest/guide/support-maint-idetoolkits.html")
                }
            }

            row {
                cell(enableAutoUpdate).bindSelected(
                    AwsSettings.getInstance()::isAutoUpdateEnabled,
                    AwsSettings.getInstance()::isAutoUpdateEnabled::set
                )
            }

            indent {
                row {
                    cell(enableAutoUpdateNotification).bindSelected(
                        AwsSettings.getInstance()::isAutoUpdateNotificationEnabled,
                        AwsSettings.getInstance()::isAutoUpdateNotificationEnabled::set
                    ).enabledIf(enableAutoUpdate.selected)
                        .comment(message("aws.settings.auto_update.notification_enable.tooltip"))
                }
            }
        }
    }

    override fun getId(): String = "aws"
}
