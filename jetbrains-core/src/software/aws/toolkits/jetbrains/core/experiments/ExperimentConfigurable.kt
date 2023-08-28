// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.experiments

import com.intellij.icons.AllIcons
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.core.utils.htmlWrap
import software.aws.toolkits.resources.message

class ExperimentConfigurable : BoundConfigurable(message("aws.toolkit.experimental.title")), SearchableConfigurable {
    override fun getId() = "aws.experiments"

    override fun createPanel() = panel {
        row { label(message("aws.toolkit.experimental.description").htmlWrap()).apply { component.icon = AllIcons.General.Warning } }
        ToolkitExperimentManager.visibleExperiments().forEach { toolkitExperiment ->
            row {
                checkBox(toolkitExperiment.title()).bindSelected(
                    { toolkitExperiment.isEnabled() },
                    { if (it) toolkitExperiment.setState(true) else toolkitExperiment.setState(false) }
                )
            }.rowComment(toolkitExperiment.description())
        }
    }
}
