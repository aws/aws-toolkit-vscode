// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import java.nio.file.Paths

fun setSamExecutableFromEnvironment() {
    ExecutableManager.getInstance()
        .setExecutablePath(ExecutableType.getInstance<SamExecutable>(), Paths.get(System.getenv().getOrDefault("SAM_CLI_EXEC", "sam")))
        .toCompletableFuture().join()
}
