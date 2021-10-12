// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.testFramework.ApplicationRule
import org.junit.runner.Description
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.experiments.setState

class ExperimentRule(private val experiment: ToolkitExperiment, private val desiredEnabledState: Boolean = true) : ApplicationRule() {
    private var originalState: Boolean = false

    override fun before(description: Description) {
        super.before(description)
        originalState = experiment.isEnabled()
        if (originalState != desiredEnabledState) {
            experiment.setState(desiredEnabledState)
        }
    }

    override fun after() {
        if (experiment.isEnabled() != originalState) {
            experiment.setState(originalState)
        }
    }
}
