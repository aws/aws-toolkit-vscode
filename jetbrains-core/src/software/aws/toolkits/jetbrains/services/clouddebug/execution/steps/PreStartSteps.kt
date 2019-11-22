// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.clouddebug.execution.ParallelStep
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Step
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings

class PreStartSteps(private val settings: EcsServiceCloudDebuggingRunSettings) : ParallelStep() {
    override val stepName = "Pre-Start"

    override fun buildChildSteps(context: Context): List<Step> = listOf(
        CopyArtifactsStep(settings),
        SetUpPortForwarding(settings),
        StopApplications(settings, false)
    )
}
