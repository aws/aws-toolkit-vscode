// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.remoteDev.hostStatus.UnattendedHostConstants
import com.intellij.remoteDev.hostStatus.UnattendedHostStatus
import com.intellij.util.net.NetUtils
import com.intellij.util.text.nullize
import com.jetbrains.rd.util.lifetime.Lifetime
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.CodeCatalystException
import software.amazon.awssdk.services.codecatalyst.model.RepositoryInput
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.gateway.BranchCloneType
import software.aws.toolkits.jetbrains.gateway.CawsSettings
import software.aws.toolkits.jetbrains.gateway.CawsWizardCloneType
import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.gateway.WorkspaceIdentifier
import software.aws.toolkits.jetbrains.gateway.toWorkspace
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import java.net.URI
import java.time.Duration
import software.aws.toolkits.telemetry.Result as TelemetryResult

private const val PROJECT_PATH = "/projects"
const val IDE_BACKEND_DIR = "/aws/mde/ide-runtimes/jetbrains/runtime/"
val GET_IDE_BACKEND_VERSION_COMMAND = "cat $IDE_BACKEND_DIR/build.txt"
private const val REMOTE_SERVER_CMD = "$IDE_BACKEND_DIR/bin/remote-dev-server.sh"

class IdeBackendActions(
    private val remoteScriptPath: String,
    projectName: String?,
    private val remoteCommandExecutor: AbstractSsmCommandExecutor
) {
    // use projectPath if it exists, otherwise fallback to the default root
    private val projectPath by lazy {
        projectName ?: return@lazy PROJECT_PATH

        val path = "$PROJECT_PATH/$projectName".trimEnd('/')
        if (remoteCommandExecutor.remoteDirectoryExistsUnsafe(path)) {
            path
        } else {
            PROJECT_PATH
        }
    }

    fun startBackend(): ProcessHandler = remoteCommandExecutor.executeLongLivedSshCommandLine {
        val cmd = buildString {
            val token = if (ApplicationManager.getApplication().isUnitTestMode) {
                System.getenv("CWM_HOST_STATUS_OVER_HTTP_TOKEN")
            } else if (isDeveloperMode()) {
                System.getProperty("user.name")
            } else {
                null
            }

            token?.let { append("CWM_HOST_STATUS_OVER_HTTP_TOKEN=$it ") }

            append("$remoteScriptPath/start-ide.sh $REMOTE_SERVER_CMD $projectPath")
        }

        it.addToRemoteCommand(cmd)
    }

    fun remoteScriptsExist() = remoteCommandExecutor.remoteDirectoryExistsUnsafe(remoteScriptPath)

    fun getStatus(timeout: Duration): IdeBackendStatus {
        val time: Long
        val start = System.currentTimeMillis()
        val output = try {
            remoteCommandExecutor.executeCommandNonInteractive(REMOTE_SERVER_CMD, "status", projectPath, timeout = timeout)
        } catch (e: CodeCatalystException) {
            e.message?.let {
                if (it.contains("not found") || it.contains("not running")) {
                    // TODO: if we get this enough times we should cancel
                    LOG.warn { "Dev Environment is in a terminal state: $it" }
                    return IdeBackendStatus.HostNotAlive
                }
            }

            CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                project = null,
                userId = lazilyGetUserId(),
                result = TelemetryResult.Failed,
                duration = System.currentTimeMillis() - start.toDouble(),
                codecatalystDevEnvironmentWorkflowStep = "getStatus",
                codecatalystDevEnvironmentWorkflowError = e.javaClass.simpleName
            )

            throw e
        } finally {
            time = System.currentTimeMillis() - start
        }

        LOG.debug { "IDE backend status: $output" }

        if (output.exitCode != 0) {
            // ECS Exec doesn't actually support exit codes yet https://github.com/aws/amazon-ecs-agent/issues/2846
            LOG.warn { "Command executor got non-zero exit code: ${output.exitCode}" }
            CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                project = null,
                userId = lazilyGetUserId(),
                result = TelemetryResult.Failed,
                duration = time.toDouble(),
                codecatalystDevEnvironmentWorkflowStep = "getStatus",
                codecatalystDevEnvironmentWorkflowError = "timeout"
            )

            return IdeBackendStatus.HostNotAlive
        }

        CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
            project = null,
            userId = lazilyGetUserId(),
            result = TelemetryResult.Succeeded,
            duration = time.toDouble(),
            codecatalystDevEnvironmentWorkflowStep = "getStatus"
        )

        val statusPrefix = UnattendedHostConstants.STATUS_PREFIX
        val statusStart = output.stdout.lastIndexOf(statusPrefix)

        if (statusStart < 0) {
            if (output.stdout.contains("IDE has not been initialized yet")) {
                return IdeBackendStatus.HostAlive(null)
            }
            return IdeBackendStatus.HostNotAlive
        }

        val status = tryOrNull {
            UnattendedHostStatus.fromJson(
                output.stdout.subSequence(statusStart + statusPrefix.length, output.stdout.lastIndexOf('}') + 1).toString()
            )
            // we get a JSON parse error if the output looks like this:
            // STATUS:
            // {
            //  "appPid": 737,
            //  "appVersion": "IU-223.6646.115",
            //  "runtimeVersion": "17.0.4.1b646.8",
            //  "unattendedMode": false,
            //  "backendUnresponsive": false,
            //  "modalDialogIsOpened": false,
            //  "idePath": "/aws/mde/ide-runtimes/jetbrains/runtime"
            // }
            // ###FailureReason###
            // java.lang.IllegalStateException: Failed to initialize project: /projects/repo2
            // Exception in thread "AWT-EventQueue-0" ###FailureReasonEnd###
            //  <rest of stacktrace>...
            // 	Suppressed: kotlinx.coroutines.DiagnosticCoroutineContextException: [no parent and no name, ModalityState.NON_MODAL, StandaloneCoroutine{Cancelling}@6dfed258, EDT]
            //                                                                                                                                                     ^ error due to finding this }
            // rather than be more robust, just treat it as a failure and let the backend restart auto-retry
        } ?: return IdeBackendStatus.HostAlive(null)

        val projectIdx = status.projects?.indexOfFirst { it.projectPath == projectPath }
        if (projectIdx == null || projectIdx < 0) {
            return IdeBackendStatus.HostAlive(status)
        }

        return IdeBackendStatus.BackendRunning(status, projectIdx)
    }

    fun getGatewayConnectLink(status: IdeBackendStatus): Pair<Long, URI>? {
        val backendStatus = (status as? IdeBackendStatus.BackendRunning) ?: return null
        // TODO: should we do what JetBrains does instead?
        // ps aux | egrep ${status.idePath} + '.*com.intellij.idea.Main [c]wmHostNoLobby' + $projectPath
        val pid = backendStatus.hostStatus.appPid
        val joinLink = backendStatus.projectStatus.joinLink

        return pid to URI(joinLink)
    }

    fun getGatewayConnectLink(timeout: Duration): Pair<Long, URI>? = getGatewayConnectLink(getStatus(timeout))

    fun forwardBackendToLocalhost(connectLink: URI, lifetime: Lifetime): URI {
        val localPort = NetUtils.findAvailableSocketPort()

        val processHandler = remoteCommandExecutor.portForward(localPort, connectLink.port)
        lifetime.onTermination {
            processHandler.destroyProcess()
        }

        return URI(
            connectLink.scheme,
            connectLink.userInfo,
            "localhost",
            localPort,
            connectLink.path,
            connectLink.query,
            connectLink.fragment
        )
    }

    companion object {
        private val LOG = getLogger<IdeBackendActions>()

        fun createWorkspace(cawsClient: CodeCatalystClient, settings: CawsSettings): Workspace {
            val productType = settings.productType ?: throw IllegalStateException("IDE runtime was not provided")
            val project = settings.project ?: throw IllegalStateException("Project was not provided")

            val workspace = cawsClient.createDevEnvironment {
                it.spaceName(project.space)
                it.projectName(project.project)

                if (settings.cloneType == CawsWizardCloneType.CAWS) {
                    it.repositories(
                        RepositoryInput.builder()
                            .repositoryName(settings.linkedRepoName)
                            .apply {
                                when (settings.branchCloneType) {
                                    BranchCloneType.NEW_FROM_EXISTING -> branchName(settings.createBranchName)
                                    BranchCloneType.EXISTING -> branchName(settings.linkedRepoBranch?.name)
                                }
                            }
                            .build()
                    )
                } else {
                    // IMO the API should just let this be null instead of forcing an empty list
                    it.repositories(emptyList())
                }
                it.instanceType(settings.instanceType)
                it.persistentStorage({ storage ->
                    storage.sizeInGiB(settings.persistentStorage)
                })
                it.inactivityTimeoutMinutes(settings.inactivityTimeout.asMinutes())
                it.alias(settings.alias.nullize(true))
                it.ides({ ide ->
                    ide.name(productType.apiType)
                    ide.runtime(productType.ecrImage)
                })
            }

            val metadata = cawsClient.getDevEnvironment {
                it.spaceName(project.space)
                it.projectName(project.project)
                it.id(workspace.id())
            }

            return metadata.toWorkspace(WorkspaceIdentifier(project, workspace.id()))
        }
    }
}
