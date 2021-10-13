// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.resources.message

object JsonResourceModificationExperiment : ToolkitExperiment(
    "jsonResourceModification",
    { message("dynamic_resources.experiment.title") },
    { message("dynamic_resources.experiment.description") }
)
