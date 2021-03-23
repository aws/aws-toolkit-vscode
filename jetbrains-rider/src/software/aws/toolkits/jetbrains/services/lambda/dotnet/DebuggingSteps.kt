// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessOutput
import com.intellij.execution.util.ExecUtil
import com.intellij.util.text.nullize
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.steps.GetPorts.Companion.DEBUG_PORTS
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.resources.message
import java.time.Duration

class FindDockerContainer : Step() {
    override val stepName = message("sam.debug.find_container")
    override val hidden = false
    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val frontendPort = context.getRequiredAttribute(DEBUG_PORTS).first()
        val container = runProcessUntil(
            duration = Duration.ofMillis(SamDebugSupport.debuggerConnectTimeoutMs()),
            cmd = GeneralCommandLine(
                "docker",
                "ps",
                "-q",
                "-f",
                "publish=$frontendPort"
            )
        ) {
            it.stdout.trim().nullize()
        }
        context.putAttribute(DOCKER_CONTAINER, container)
    }

    companion object {
        val DOCKER_CONTAINER = AttributeBagKey.create<String>("DOCKER_CONTAINER")
    }
}

class FindPid : Step() {
    override val stepName = message("sam.debug.dotnet_find_pid")
    override val hidden = false
    override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
        val dockerContainer = context.getRequiredAttribute(FindDockerContainer.DOCKER_CONTAINER)
        val pid = runProcessUntil(
            duration = Duration.ofMillis(SamDebugSupport.debuggerConnectTimeoutMs()),
            cmd = GeneralCommandLine(
                "docker",
                "exec",
                "-i",
                dockerContainer,
                "/bin/sh",
                "-c",
                FIND_PID_SCRIPT
            )
        ) {
            it.stdout.trim().nullize()?.toIntOrNull()
        }
        context.putAttribute(DOTNET_PID, pid)
    }

    companion object {
        val DOTNET_PID = AttributeBagKey.create<Int>("DOTNET_PID")
        private const val FIND_PID_SCRIPT =
            """
            for i in `ls /proc/*/exe` ; do
                symlink=`readlink  ${'$'}i 2>/dev/null`;
                if [[ "${'$'}symlink" == *"/dotnet" ]]; then
                    echo  ${'$'}i | sed -n 's/.*\/proc\/\(.*\)\/exe.*/\1/p'
                fi;
            done;
        """
    }
}

private fun <T> runProcessUntil(duration: Duration, cmd: GeneralCommandLine, resultChecker: (ProcessOutput) -> T?): T = runBlocking {
    val start = System.nanoTime()
    var lastAttemptOutput: ProcessOutput? = null
    while (System.nanoTime() - start <= duration.toNanos()) {
        lastAttemptOutput = ExecUtil.execAndGetOutput(cmd, timeoutInMilliseconds = duration.toMillis().toInt())

        resultChecker(lastAttemptOutput)?.let {
            return@runBlocking it
        }

        delay(100)
    }

    throw IllegalStateException(
        "Command did not return expected result within $duration, last attempt; cmd: '${cmd.commandLineString}', " +
            "exitCode: ${lastAttemptOutput?.exitCode}, stdOut: '${lastAttemptOutput?.stdout?.trim()}', stdErr: '${lastAttemptOutput?.stderr?.trim()}'"
    )
}
