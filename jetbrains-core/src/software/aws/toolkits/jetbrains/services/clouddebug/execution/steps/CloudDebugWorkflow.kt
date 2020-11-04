// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.runners.ExecutionEnvironment
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow

class CloudDebugWorkflow(settings: EcsServiceCloudDebuggingRunSettings, environment: ExecutionEnvironment) : StepWorkflow(
    CloudDebugCliValidate(),
    RetrieveRole(settings),
    ResourceInstrumenter(settings),
    PreStartSteps(settings),
    SetUpStartApplications(settings),
    SetUpDebuggers(settings, environment)
)
