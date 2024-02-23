// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.rd.createNestedDisposable
import com.intellij.openapi.rd.util.launchChildSyncIOBackground
import com.intellij.openapi.rd.util.launchIOBackground
import com.intellij.openapi.rd.util.launchOnUiAnyModality
import com.intellij.openapi.rd.util.startUnderBackgroundProgressAsync
import com.intellij.openapi.rd.util.startUnderModalProgressAsync
import com.intellij.openapi.ui.DialogBuilder
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.BuildNumber
import com.intellij.openapi.util.Disposer
import com.intellij.remoteDev.downloader.CodeWithMeClientDownloader
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.util.ui.JBFont
import com.jetbrains.gateway.api.ConnectionRequestor
import com.jetbrains.gateway.api.GatewayConnectionHandle
import com.jetbrains.gateway.api.GatewayConnectionProvider
import com.jetbrains.gateway.api.GatewayUI
import com.jetbrains.rd.framework.util.launch
import com.jetbrains.rd.util.lifetime.Lifetime
import com.jetbrains.rd.util.lifetime.LifetimeDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.await
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentStatus
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.logoutFromSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.CODECATALYST_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.CodeCatalystCredentialManager
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.gateway.connection.GET_IDE_BACKEND_VERSION_COMMAND
import software.aws.toolkits.jetbrains.gateway.connection.GitSettings
import software.aws.toolkits.jetbrains.gateway.connection.IDE_BACKEND_DIR
import software.aws.toolkits.jetbrains.gateway.connection.caws.CawsCommandExecutor
import software.aws.toolkits.jetbrains.gateway.connection.workflow.CloneCode
import software.aws.toolkits.jetbrains.gateway.connection.workflow.CopyScripts
import software.aws.toolkits.jetbrains.gateway.connection.workflow.InstallPluginBackend.InstallLocalPluginBackend
import software.aws.toolkits.jetbrains.gateway.connection.workflow.InstallPluginBackend.InstallMarketplacePluginBackend
import software.aws.toolkits.jetbrains.gateway.connection.workflow.PrimeSshAgent
import software.aws.toolkits.jetbrains.gateway.connection.workflow.TabbedWorkflowEmitter
import software.aws.toolkits.jetbrains.gateway.connection.workflow.installBundledPluginBackend
import software.aws.toolkits.jetbrains.gateway.connection.workflow.v2.StartBackendV2
import software.aws.toolkits.jetbrains.gateway.welcomescreen.WorkspaceListStateChangeContext
import software.aws.toolkits.jetbrains.gateway.welcomescreen.WorkspaceNotifications
import software.aws.toolkits.jetbrains.services.caws.CawsProject
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import java.net.URLDecoder
import java.time.Duration
import java.util.UUID
import javax.swing.JLabel
import kotlin.time.DurationUnit
import kotlin.time.ExperimentalTime
import kotlin.time.measureTimedValue
import software.aws.toolkits.telemetry.Result as TelemetryResult

@ExperimentalTime
class CawsConnectionProvider : GatewayConnectionProvider {
    companion object {
        val CAWS_CONNECTION_PARAMETERS = AttributeBagKey.create<Map<String, String>>("CAWS_CONNECTION_PARAMETERS")
        private val LOG = getLogger<CawsConnectionProvider>()
    }

    override fun isApplicable(parameters: Map<String, String>): Boolean = parameters.containsKey(CawsConnectionParameters.CAWS_ENV_ID)

    override suspend fun connect(parameters: Map<String, String>, requestor: ConnectionRequestor): GatewayConnectionHandle? {
        val connectionParams = try {
            CawsConnectionParameters.fromParameters(parameters)
        } catch (e: Exception) {
            LOG.error(e) { "Caught exception while building connection settings" }
            Messages.showErrorDialog(e.message ?: message("general.unknown_error"), message("caws.workspace.connection.failed"))
            return null
        }

        val currentConnection = ToolkitConnectionManager.getInstance(null).activeConnectionForFeature(CodeCatalystConnection.getInstance())
            as AwsBearerTokenConnection?

        val ssoSettings = connectionParams.ssoSettings ?: SsoSettings(SONO_URL, SONO_REGION)

        if (currentConnection != null) {
            if (ssoSettings.startUrl != currentConnection.startUrl) {
                val ans = Messages.showOkCancelDialog(
                    message("gateway.auth.different.account.required", ssoSettings.startUrl),
                    message("gateway.auth.different.account.sign.in"),
                    message("caws.login"),
                    message("general.cancel"),
                    Messages.getErrorIcon(),
                    null
                )
                if (ans == Messages.OK) {
                    logoutFromSsoConnection(project = null, currentConnection)
                    loginSso(project = null, ssoSettings.startUrl, ssoSettings.region, CODECATALYST_SCOPES)
                } else {
                    return null
                }
            }
        }

        val connectionSettings = try {
            CodeCatalystCredentialManager.getInstance().getConnectionSettings() ?: error("Unable to find connection settings")
        } catch (e: ProcessCanceledException) {
            return null
        }

        val userId = lazilyGetUserId()

        val spaceName = connectionParams.space
        val projectName = connectionParams.project
        val envId = connectionParams.envId
        val id = WorkspaceIdentifier(CawsProject(spaceName, projectName), envId)

        val lifetime = Lifetime.Eternal.createNested()
        val workflowDisposable = Lifetime.Eternal.createNestedDisposable()

        return CawsGatewayConnectionHandle(lifetime, envId) {
            // reference lost with all the blocks
            it.let { gatewayHandle ->
                val view = JBTabbedPane()
                val workflowEmitter = TabbedWorkflowEmitter(view, workflowDisposable)

                fun handleException(e: Throwable) {
                    if (e is ProcessCanceledException || e is CancellationException) {
                        CodecatalystTelemetry.connect(project = null, userId = userId, result = TelemetryResult.Cancelled)
                        LOG.warn { "Connect to dev environment cancelled" }
                    } else {
                        CodecatalystTelemetry.connect(project = null, userId = userId, result = TelemetryResult.Failed, reason = e.javaClass.simpleName)
                        LOG.error(e) { "Caught exception while connecting to dev environment" }
                    }
                    lifetime.terminate()
                }

                // TODO: Describe env to validate JB ide is set on it
                lifetime.launch {
                    try {
                        val cawsClient = connectionSettings.awsClient<CodeCatalystClient>()
                        val environmentActions = WorkspaceActions(spaceName, projectName, envId, cawsClient)
                        val executor = CawsCommandExecutor(cawsClient, envId, spaceName, projectName)

                        // should probably consider logging output to logger as well
                        // on failure we should display meaningful error and put retry button somewhere
                        lifetime.startUnderModalProgressAsync(
                            title = message("caws.connecting.waiting_for_environment"),
                            canBeCancelled = true,
                            isIndeterminate = true,
                        ) {
                            val timeBeforeEnvIsRunningCheck = System.currentTimeMillis()
                            var validateEnvIsRunningResult = TelemetryResult.Succeeded
                            var errorMessageDuringStateValidation: String? = null
                            try {
                                validateEnvironmentIsRunning(indicator, environmentActions)
                            } catch (e: Exception) {
                                validateEnvIsRunningResult = TelemetryResult.Failed
                                errorMessageDuringStateValidation = e.message
                                throw e
                            } finally {
                                CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                                    project = null,
                                    userId = userId,
                                    result = validateEnvIsRunningResult,
                                    duration = (System.currentTimeMillis() - timeBeforeEnvIsRunningCheck).toDouble(),
                                    codecatalystDevEnvironmentWorkflowStep = "validateEnvRunning",
                                    codecatalystDevEnvironmentWorkflowError = errorMessageDuringStateValidation
                                )
                            }

                            lifetime.launchIOBackground {
                                ApplicationManager.getApplication().messageBus.syncPublisher(WorkspaceNotifications.TOPIC)
                                    .environmentStarted(
                                        WorkspaceListStateChangeContext(
                                            WorkspaceIdentifier(CawsProject(spaceName, projectName), envId)
                                        )
                                    )
                            }

                            val pluginPath = "$IDE_BACKEND_DIR/plugins/${AwsToolkit.pluginPath().fileName}"
                            var retries = 3
                            val startTimeToCheckInstallation = System.currentTimeMillis()

                            val toolkitInstallSettings: ToolkitInstallSettings? = coroutineScope {
                                while (retries > 0) {
                                    indicator.checkCanceled()
                                    val pluginIsInstalled = executor.remoteDirectoryExists(
                                        pluginPath,
                                        timeout = Duration.ofSeconds(15)
                                    )

                                    when (pluginIsInstalled) {
                                        null -> {
                                            if (retries == 1) {
                                                return@coroutineScope null
                                            } else {
                                                retries--
                                                continue
                                            }
                                        }

                                        true -> return@coroutineScope ToolkitInstallSettings.None
                                        false -> return@coroutineScope connectionParams.toolkitInstallSettings
                                    }
                                }
                            } as ToolkitInstallSettings?

                            toolkitInstallSettings ?: let {
                                // environment is non-responsive to SSM; restart
                                LOG.warn { "Restarting $envId since it appears unresponsive to SSM Run-Command" }
                                val timeTakenToCheckInstallation = System.currentTimeMillis() - startTimeToCheckInstallation
                                CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                                    project = null,
                                    userId = userId,
                                    result = TelemetryResult.Failed,
                                    codecatalystDevEnvironmentWorkflowStep = "ToolkitInstallationSSMCheck",
                                    codecatalystDevEnvironmentWorkflowError = "Timeout/Unknown error while connecting to Dev Env via SSM",
                                    duration = timeTakenToCheckInstallation.toDouble()
                                )

                                launchChildSyncIOBackground {
                                    environmentActions.stopEnvironment()
                                    GatewayUI.getInstance().connect(parameters)
                                }

                                gatewayHandle.terminate()
                                return@startUnderModalProgressAsync JLabel()
                            }

                            lifetime.startUnderBackgroundProgressAsync(message("caws.download.thin_client"), isIndeterminate = true) {
                                val (backendVersion, getBackendVersionTime) = measureTimedValue {
                                    tryOrNull {
                                        executor.executeCommandNonInteractive(
                                            "sh",
                                            "-c",
                                            GET_IDE_BACKEND_VERSION_COMMAND,
                                            timeout = Duration.ofSeconds(15)
                                        ).stdout
                                    }
                                }
                                CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                                    project = null,
                                    userId = userId,
                                    result = if (backendVersion != null) TelemetryResult.Succeeded else TelemetryResult.Failed,
                                    duration = getBackendVersionTime.toDouble(DurationUnit.MILLISECONDS),
                                    codecatalystDevEnvironmentWorkflowStep = "getBackendVersion"
                                )

                                if (backendVersion.isNullOrBlank()) {
                                    LOG.warn { "Could not determine backend version to prefetch thin client" }
                                } else {
                                    val (clientPaths, downloadClientTime) = measureTimedValue {
                                        BuildNumber.fromStringOrNull(backendVersion)?.asStringWithoutProductCode()?.let { build ->
                                            LOG.info { "Fetching client for version: $build" }
                                            CodeWithMeClientDownloader.downloadClientAndJdk(build, indicator)
                                        }
                                    }

                                    CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                                        project = null,
                                        userId = userId,
                                        result = if (clientPaths != null) TelemetryResult.Succeeded else TelemetryResult.Failed,
                                        duration = downloadClientTime.toDouble(DurationUnit.MILLISECONDS),
                                        codecatalystDevEnvironmentWorkflowStep = "downloadThinClient"
                                    )
                                }
                            }

                            runBackendWorkflow(
                                view,
                                workflowEmitter,
                                userId,
                                indicator,
                                lifetime.createNested(),
                                parameters,
                                executor,
                                id,
                                connectionParams.gitSettings,
                                toolkitInstallSettings
                            ).await()
                        }.invokeOnCompletion { e ->
                            if (e == null) {
                                CodecatalystTelemetry.connect(project = null, userId = userId, result = TelemetryResult.Succeeded)
                                lifetime.onTermination {
                                    Disposer.dispose(workflowDisposable)
                                }
                            } else {
                                handleException(e)
                                if (e is ProcessCanceledException || e is CancellationException) {
                                    return@invokeOnCompletion
                                }
                                runInEdt {
                                    DialogBuilder().apply {
                                        setCenterPanel(
                                            panel {
                                                row {
                                                    icon(AllIcons.General.ErrorDialog).verticalAlign(VerticalAlign.TOP)

                                                    panel {
                                                        row {
                                                            label(message("caws.workspace.connection.failed")).applyToComponent {
                                                                font = JBFont.regular().asBold()
                                                            }
                                                        }

                                                        row {
                                                            label(e.message ?: message("general.unknown_error"))
                                                        }
                                                    }
                                                }

                                                if (view.tabCount != 0) {
                                                    collapsibleGroup(message("general.logs"), false) {
                                                        row {
                                                            cell(view)
                                                                .horizontalAlign(HorizontalAlign.FILL)
                                                        }
                                                    }.expanded = false
                                                    // TODO: can't seem to reliably force a terminal redraw on initial expand
                                                }
                                            }
                                        )

                                        addOkAction()
                                        addCancelAction()
                                        okAction.setText(message("settings.retry"))
                                        setOkOperation {
                                            dialogWrapper.close(DialogWrapper.OK_EXIT_CODE)
                                            GatewayUI.getInstance().connect(parameters)
                                        }
                                    }.show()
                                    Disposer.dispose(workflowDisposable)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        handleException(e)
                        if (e is ProcessCanceledException || e is CancellationException) {
                            return@launch
                        }

                        runInEdt {
                            Messages.showErrorDialog(e.message ?: message("general.unknown_error"), message("caws.workspace.connection.failed"))
                        }
                        throw e
                    }
                }

                return@let panel {
                    row {
                        cell(view)
                            .align(Align.FILL)
                    }
                }
            }
        }
    }

    private fun validateEnvironmentIsRunning(
        indicator: ProgressIndicator,
        environmentActions: WorkspaceActions
    ) {
        when (val status = environmentActions.getEnvironmentDetails().status()) {
            DevEnvironmentStatus.PENDING, DevEnvironmentStatus.STARTING -> environmentActions.waitForTaskReady(indicator)
            DevEnvironmentStatus.RUNNING -> {
            }
            DevEnvironmentStatus.STOPPING -> {
                environmentActions.waitForTaskStopped(indicator)
                environmentActions.startEnvironment()
                environmentActions.waitForTaskReady(indicator)
            }
            DevEnvironmentStatus.STOPPED -> {
                environmentActions.startEnvironment()
                environmentActions.waitForTaskReady(indicator)
            }
            DevEnvironmentStatus.DELETING, DevEnvironmentStatus.DELETED -> throw IllegalStateException("Environment is deleted, unable to start")
            else -> throw IllegalStateException("Unknown state $status")
        }
    }

    private fun runBackendWorkflow(
        view: JBTabbedPane,
        workflowEmitter: TabbedWorkflowEmitter,
        userId: String,
        indicator: ProgressIndicator,
        lifetime: LifetimeDefinition,
        parameters: Map<String, String>,
        executor: CawsCommandExecutor,
        envId: WorkspaceIdentifier,
        gitSettings: GitSettings,
        toolkitInstallSettings: ToolkitInstallSettings,
    ): AsyncPromise<Unit> {
        val remoteScriptPath = "/tmp/${UUID.randomUUID()}"
        val remoteProjectName = (gitSettings as? GitSettings.GitRepoSettings)?.repoName

        val steps = buildList {
            add(CopyScripts(remoteScriptPath, executor))

            when (gitSettings) {
                is GitSettings.CloneGitSettings -> {
                    if (gitSettings.repo.scheme == "ssh") {
                        // TODO: we should probably use JB's SshConnectionService/ConnectionBuilder since they have better ssh agent support than we could write
                        add(PrimeSshAgent(gitSettings))
                    }
                    add(CloneCode(remoteScriptPath, gitSettings, executor))
                }

                is GitSettings.CawsOwnedRepoSettings,
                is GitSettings.NoRepo -> {
                }
            }

            when (toolkitInstallSettings) {
                is ToolkitInstallSettings.None -> {}
                is ToolkitInstallSettings.UseSelf -> {
                    add(installBundledPluginBackend(executor, remoteScriptPath, IDE_BACKEND_DIR))
                }
                is ToolkitInstallSettings.UseArbitraryLocalPath -> {
                    add(InstallLocalPluginBackend(toolkitInstallSettings, executor, remoteScriptPath, IDE_BACKEND_DIR))
                }
                is ToolkitInstallSettings.UseMarketPlace -> {
                    add(InstallMarketplacePluginBackend(null, executor, remoteScriptPath, IDE_BACKEND_DIR))
                }
            }

            add(StartBackendV2(lifetime, indicator, envId, remoteProjectName))
        }

        val promise = AsyncPromise<Unit>()
        fun start() {
            lifetime.launchOnUiAnyModality {
                view.removeAll()
            }

            indicator.fraction = 0.0
            val workflow = object : StepWorkflow(steps) {
                override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
                    runInEdt(ModalityState.any()) {
                        indicator.isIndeterminate = false
                    }

                    topLevelSteps.forEachIndexed { i, step ->
                        indicator.checkCanceled()
                        runInEdt(ModalityState.any()) {
                            indicator.fraction = i.toDouble() / steps.size
                            indicator.text = step.stepName
                        }

                        val start = System.currentTimeMillis()
                        var error: Throwable? = null
                        try {
                            step.run(context, stepEmitter)
                        } catch (e: Throwable) {
                            error = e
                            throw e
                        } finally {
                            val time = System.currentTimeMillis() - start
                            LOG.info { "${step.stepName} took ${time}ms" }

                            val result = when (error) {
                                null -> TelemetryResult.Succeeded
                                is ProcessCanceledException, is CancellationException -> TelemetryResult.Cancelled
                                else -> TelemetryResult.Failed
                            }

                            CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                                project = null,
                                userId = userId,
                                result = result,
                                duration = time.toDouble(),
                                codecatalystDevEnvironmentWorkflowStep = step.stepName,
                                codecatalystDevEnvironmentWorkflowError = error?.javaClass?.simpleName
                            )
                        }
                    }
                }
            }

            StepExecutor(project = null, workflow, workflowEmitter)
                .also {
                    it.addContext(CAWS_CONNECTION_PARAMETERS, parameters)
                    lifetime.onTermination {
                        it.getProcessHandler().destroyProcess()
                    }

                    it.onSuccess = {
                        promise.setResult(Unit)
                    }

                    it.onError = { throwable ->
                        promise.setError(throwable)
                    }

                    it.startExecution()
                }
        }

        start()

        return promise
    }
}

data class CawsConnectionParameters(
    val space: String,
    val project: String,
    val envId: String,
    val gitSettings: GitSettings,
    val toolkitInstallSettings: ToolkitInstallSettings,
    val ssoSettings: SsoSettings?
) {
    companion object {
        const val CAWS_SPACE = "aws.codecatalyst.space"
        const val CAWS_PROJECT = "aws.codecatalyst.project"
        const val CAWS_ENV_ID = "aws.codecatalyst.env.id"
        const val CAWS_GIT_REPO_NAME = "aws.codecatalyst.git.repo.name"
        const val CAWS_UNLINKED_GIT_REPO_URL = "aws.caws.unlinked.git.repo.url"
        const val CAWS_UNLINKED_GIT_REPO_BRANCH = "aws.caws.unlinked.git.repo.branch"
        const val DEV_SETTING_USE_BUNDLED_TOOLKIT = "aws.caws.dev.use.bundled.toolkit"
        const val DEV_SETTING_TOOLKIT_PATH = "aws.caws.dev.toolkit.path"
        const val DEV_SETTING_S3_STAGING = "aws.caws.dev.s3.staging"
        const val SSO_START_URL = "sso_start_url"
        const val SSO_REGION = "sso_region"

        fun fromParameters(parameters: Map<String, String>): CawsConnectionParameters {
            val spaceName = parameters[CAWS_SPACE] ?: error("Missing required parameter: CAWS space name")
            val projectName = parameters[CAWS_PROJECT] ?: throw IllegalStateException("Missing required parameter: CAWS project name")
            val envId = parameters[CAWS_ENV_ID] ?: throw IllegalStateException("Missing required parameter: CAWS environment id")
            val repoName = parameters[CAWS_GIT_REPO_NAME]
            val gitRepoUrl = parameters[CAWS_UNLINKED_GIT_REPO_URL]
            val gitRepoBranch = parameters[CAWS_UNLINKED_GIT_REPO_BRANCH]
            val useBundledToolkit = parameters[DEV_SETTING_USE_BUNDLED_TOOLKIT]?.toBoolean()
            val toolkitPath = parameters[DEV_SETTING_TOOLKIT_PATH]
            val s3StagingBucket = parameters[DEV_SETTING_S3_STAGING]
            val ssoStartUrl = parameters[SSO_START_URL]
            val ssoRegion = parameters[SSO_REGION]

            val gitSettings =
                if (repoName != null) {
                    GitSettings.CawsOwnedRepoSettings(repoName)
                } else if (!gitRepoUrl.isNullOrEmpty() && !gitRepoBranch.isNullOrEmpty()) {
                    GitSettings.CloneGitSettings(gitRepoUrl, gitRepoBranch)
                } else {
                    GitSettings.NoRepo
                }

            val providedInstallSettings =
                if (useBundledToolkit == true) {
                    ToolkitInstallSettings.UseSelf
                } else if (toolkitPath?.isNotBlank() == true && s3StagingBucket?.isNotBlank() == true) {
                    ToolkitInstallSettings.UseArbitraryLocalPath(toolkitPath, s3StagingBucket)
                } else {
                    ToolkitInstallSettings.UseMarketPlace
                }

            val ssoSettings = if (ssoStartUrl != null && ssoRegion != null) {
                SsoSettings.fromUrlParameters(ssoStartUrl, ssoRegion)
            } else {
                null
            }

            return CawsConnectionParameters(
                spaceName,
                projectName,
                envId,
                gitSettings,
                providedInstallSettings,
                ssoSettings
            )
        }
    }
}

data class SsoSettings(
    val startUrl: String,
    val region: String
) {
    companion object {
        fun fromUrlParameters(startUrl: String, region: String) = SsoSettings(URLDecoder.decode(startUrl, "UTF-8"), region)
    }
}
