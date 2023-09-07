// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.OutputListener
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessOutput
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.util.Key
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.gateway.GitWrappers
import java.nio.file.Path
import java.time.Duration

abstract class AbstractSsmCommandExecutor(private val region: AwsRegion, protected val ssmTarget: String) {
    abstract fun startSsh(): StartSessionResponse

    /**
     * @param argv the command to be executed
     */
    abstract fun startSsm(exe: String, vararg args: String): StartSessionResponse

    fun portForward(localPort: Int, remotePort: Int): ProcessHandler = executeLongLivedSshCommandLine {
        it.localPortForward(localPort, remotePort)
    }

    fun executeLongLivedSshCommandLine(builder: (SshCommandLine) -> Unit): ProcessHandler {
        val sshCommand = newSshCommand().also {
            builder.invoke(it)
        }
        val id = sshCommand.hashCode()
        val loggingAdapter = object : OutputListener() {
            override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                if (outputType == ProcessOutputTypes.STDOUT) {
                    LOG.debug { "$id  Output StdOut: ${event.text.trim()}" }
                } else {
                    LOG.info { "$id  Output StdErr:  ${event.text.trim()}" }
                }
            }

            override fun processTerminated(event: ProcessEvent) {
                LOG.debug { "$id  Exit Code: ${event.exitCode}" }
            }
        }
        val processHandler = sshCommand.executeInBackground(loggingAdapter)

        return processHandler
    }

    fun buildSshCommand(builder: (SshCommandLine) -> Unit): GeneralCommandLine =
        newSshCommand().also {
            builder.invoke(it)
        }.constructCommandLine()

    fun executeSshCommand(builder: (SshCommandLine) -> Unit): ProcessOutput =
        newSshCommand().also {
            builder.invoke(it)
        }.executeAndGetOutput()

    fun executeCommandNonInteractive(exe: String, vararg args: String, timeout: Duration? = null) = startSsm(exe, *args).let {
        SsmCommandExecutorOutput(
            it.sessionId,
            ExecUtil.execAndGetOutput(SsmCommandLineFactory(ssmTarget, it, region).rawCommand(), timeout?.toMillis()?.toInt() ?: -1)
        )
    }

    fun remoteDirectoryExistsUnsafe(path: String): Boolean = remoteDirectoryExists(path, null) ?: false

    fun remoteDirectoryExists(path: String, timeout: Duration?): Boolean? =
        executeCommandNonInteractive("sh", "-c", "test -d '$path' && echo true || echo false", timeout = timeout).let {
            val result = it.resultFromStdOut()
            when (result) {
                StdOutResult.TIMEOUT -> {
                    LOG.warn {
                        """
                            |remoteDirectoryExists on $path timed out. (session ${it.sessionId})"
                            |available stdout: ${it.fullStdout}
                            |available stderr: ${it.stderr}
                        """.trimMargin()
                    }

                    null
                }

                StdOutResult.SUCCESS -> true
                StdOutResult.FAILED -> false
                StdOutResult.UNKNOWN -> {
                    LOG.warn { "remoteDirectoryExists received unexpected output on stdout: ${it.stdout.trim()}" }
                    null
                }
            }
        }

    fun buildGitCloneCommand(remoteScriptPath: String, gitSettings: GitSettings.CloneGitSettings): GeneralCommandLine {
        val repoUri = gitSettings.repo
        val branch = gitSettings.branch

        val gitHost = buildString {
            append(repoUri.host)
            if (repoUri.port != -1) {
                append(":${repoUri.port}")
            }
        }

        val isSsh = repoUri.scheme == "ssh"
        val gitConfig = GitWrappers.getConfig()

        val command = buildString {
            if (gitConfig != null) {
                val gitConfigArguments = buildString {
                    val name = gitConfig[GitWrappers.USER_NAME_KEY]
                    val email = gitConfig[GitWrappers.USER_EMAIL_KEY]

                    if (name != null) {
                        append(" -n '$name'")
                    }

                    if (email != null) {
                        append(" -e '$email'")
                    }
                }

                if (gitConfigArguments.isNotBlank()) {
                    append("$remoteScriptPath/git-config-user-email.sh $gitConfigArguments &&")
                }
            }

            if (isSsh) {
                append("$remoteScriptPath/keyscan-git-host.sh $gitHost &&")
            }
            append("$remoteScriptPath/git-clone.sh $repoUri $branch")
        }

        return newSshCommand()
            .also { cmd ->
                if (isSsh) {
                    cmd.addSshOption("-A")
                    val agent = SshAgentService.agentInstance()
                    if (agent is SocketBasedSshAgent) {
                        cmd.withEnvironment(mapOf(SSH_AGENT_VAR to agent.socket))
                    }
                }
            }
            // force tty-allocation since providing a command turns it off
            .addSshOption("-t")
            .addToRemoteCommand(command)
            .constructCommandLine()
    }

    fun buildScpCommand(remotePath: String, recursive: Boolean, vararg paths: Path): GeneralCommandLine =
        SsmCommandLineFactory(ssmTarget, startSsh(), region).scpCommand(remotePath, recursive)
            .addLocalPaths(*paths).constructCommandLine()

    private fun newSshCommand() = SsmCommandLineFactory(ssmTarget, startSsh(), region).sshCommand()

    fun proxyCommand() = SsmCommandLineFactory(ssmTarget, startSsh(), region).proxyCommand()

    private companion object {
        private val LOG = getLogger<AbstractSsmCommandExecutor>()
    }
}

data class SsmCommandExecutorOutput(internal val sessionId: String, private val delegate: ProcessOutput) {
    val timeout: Boolean
        get() = delegate.isTimeout

    val exitCode by delegate::exitCode
    val fullStdout by delegate::stdout
    val stderr by delegate::stderr
    val stdout by lazy {
        fullStdout
            .substringAfter(SSM_START_STRING.format(sessionId))
            .substringBeforeLast(SSM_STOP_STRING.format(sessionId))
            .replace("\r\n", "\n")
            .trim()
    }

    companion object {
        // https://github.com/aws/session-manager-plugin/blob/57d7ac0605c007efed7019455279a6f77f79ab90/src/sessionmanagerplugin/session/session.go#L214
        private const val SSM_START_STRING = "Starting session with SessionId: %s"

        // https://github.com/aws/session-manager-plugin/blob/0788d4cf2f1a34dd84bfa3b8ddea62058ab1d329/src/datachannel/streaming.go#L786
        private const val SSM_STOP_STRING = "Exiting session with sessionId: %s"
    }
}

enum class StdOutResult {
    TIMEOUT,
    SUCCESS,
    FAILED,
    UNKNOWN
}

fun SsmCommandExecutorOutput.resultFromStdOut(): StdOutResult {
    if (timeout) {
        return StdOutResult.TIMEOUT
    } else {
        val output = stdout.trim()

        return if (output == "true") {
            StdOutResult.SUCCESS
        } else if (output == "false") {
            StdOutResult.FAILED
        } else {
            StdOutResult.UNKNOWN
        }
    }
}
