// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam.sync

import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.resources.message

object SyncServerlessApplicationExperiment : ToolkitExperiment(
    "syncServerlessApplication",
    { message("serverless.application.sync") },
    { "Enables Sync applications instead of deploy" },
    default = true
)

object SyncServerlessApplicationCodeExperiment : ToolkitExperiment(
    "syncServerlessApplicationCode",
    { message("serverless.application.sync.code") },
    { "Enables Sync applications instead of deploy" },
    default = false
)
