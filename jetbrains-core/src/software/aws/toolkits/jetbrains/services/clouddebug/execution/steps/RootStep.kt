// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.runners.ExecutionEnvironment
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step

class RootStep(settings: EcsServiceCloudDebuggingRunSettings, environment: ExecutionEnvironment) : Step() {
    override val stepName: String = "RootStep"
    override val hidden = true

    private val topLevelSteps: List<Step> = listOf(
        CloudDebugCliValidate(),
        RetrieveRole(settings),
        ResourceInstrumenter(settings),
        PreStartSteps(settings),
        SetUpStartApplications(settings),
        SetUpDebuggers(settings, environment)
    )

    override fun execute(
        context: Context,
        messageEmitter: MessageEmitter,
        ignoreCancellation: Boolean
    ) {
        topLevelSteps.forEach {
            it.run(context, messageEmitter)
        }
    }
}
