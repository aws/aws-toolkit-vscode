// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.PtyCommandLine
import com.intellij.execution.process.KillableProcessHandler
import com.intellij.execution.process.ProcessHandler
import com.intellij.util.io.BaseDataReader
import com.intellij.util.io.BaseOutputReader
import software.aws.toolkits.jetbrains.utils.execution.steps.CliBasedStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Context

abstract class PtyCliBasedStep : CliBasedStep() {
    override fun createProcessHandler(commandLine: GeneralCommandLine, context: Context): ProcessHandler {
        val cmd = PtyCommandLine(commandLine)
        cmd.withConsoleMode(false)
        return object : KillableProcessHandler(cmd) {
            override fun readerOptions(): BaseOutputReader.Options {
                return object : BaseOutputReader.Options() {
                    override fun policy(): BaseDataReader.SleepingPolicy {
                        return BaseDataReader.SleepingPolicy.BLOCKING
                    }

                    override fun splitToLines(): Boolean {
                        return false
                    }
                }
            }
        }
    }
}
