// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.resources.message

object PythonAwsConnectionExperiment : ToolkitExperiment(
    "pythonRunConfigurationExtension",
    { message("run_configuration_extension.feature.python.title") },
    { message("run_configuration_extension.feature.python.description") },
    default = true
)
