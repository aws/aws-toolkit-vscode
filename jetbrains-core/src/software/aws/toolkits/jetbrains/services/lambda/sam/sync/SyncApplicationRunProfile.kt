// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam.sync

import com.intellij.execution.Executor
import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.process.KillableColoredProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.process.ProcessTerminatedListener
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.execution.ui.RunContentManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import icons.AwsIcons
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.toEnvironmentVariables
import software.aws.toolkits.jetbrains.services.lambda.sam.getSamCli
import software.aws.toolkits.jetbrains.services.lambda.sam.samSyncCommand
import java.io.IOException
import java.nio.charset.Charset
import java.nio.file.Path
import javax.swing.Icon

class SyncApplicationRunProfile(
    private val project: Project,
    private val settings: SyncServerlessApplicationSettings,
    private val connection: ConnectionSettings,
    private val templatePath: Path
) : RunProfile {
    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState = SyncApplicationRunProfileState(environment)

    override fun getName(): String = settings.stackName

    override fun getIcon(): Icon? = AwsIcons.Resources.SERVERLESS_APP

    inner class SyncApplicationRunProfileState(environment: ExecutionEnvironment) : CommandLineState(environment) {

        override fun startProcess(): ProcessHandler {
            val processHandler = KillableColoredProcessHandler(getSamSyncCommand())
            ProcessTerminatedListener.attach(processHandler)
            return processHandler
        }

        private fun getSamSyncCommand(): GeneralCommandLine = getSamCli().samSyncCommand(
            connection.toEnvironmentVariables(),
            templatePath,
            settings
        )

        override fun execute(executor: Executor, runner: ProgramRunner<*>) =
            super.execute(executor, runner).apply {
                var isDevStack = false
                processHandler?.addProcessListener(object : ProcessAdapter() {
                    override fun startNotified(event: ProcessEvent) {
                        super.startNotified(event)
                        runInEdt {
                            RunContentManager.getInstance(project).toFrontRunContent(executor, processHandler)
                        }
                    }
                    private var insertAssertionNow = false
                    override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                        if (outputType === ProcessOutputTypes.STDOUT ||
                            outputType === ProcessOutputTypes.STDERR
                        ) {
                            if (event.text.contains("Confirm that you are synchronizing a development stack.")) {
                                isDevStack = true
                            }
                            if (event.text.contains("[Y/n]:") && isDevStack) {
                                insertAssertionNow = true
                                isDevStack = false
                                ApplicationManager.getApplication().executeOnPooledThread {
                                    try {
                                        while (insertAssertionNow) {
                                            processHandler.processInput?.write("Y\n".toByteArray(Charset.defaultCharset()))
                                        }
                                    } catch (e: IOException) {
                                        /* no-op */
                                    }
                                }
                            } else {
                                insertAssertionNow = false
                            }
                        }
                    }
                })
            }
    }
}
