// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.jetbrains.services.lambda.sam.getSamCli
import software.aws.toolkits.jetbrains.utils.execution.steps.CliBasedStep

abstract class SamCliStep : CliBasedStep() {
    fun getCli(): GeneralCommandLine = getSamCli()
}
