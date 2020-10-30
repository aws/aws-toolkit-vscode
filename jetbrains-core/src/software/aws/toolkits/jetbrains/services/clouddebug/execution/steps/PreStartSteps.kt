// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.ParallelStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Step

class PreStartSteps(private val settings: EcsServiceCloudDebuggingRunSettings) : ParallelStep() {
    override val stepName = "Pre-Start"

    override fun buildChildSteps(context: Context): List<Step> = listOf(
        CopyArtifactsStep(settings),
        SetUpPortForwarding(settings),
        StopApplications(settings, false)
    )
}
