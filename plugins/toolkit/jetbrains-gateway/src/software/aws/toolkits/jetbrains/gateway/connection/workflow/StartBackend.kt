// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.jetbrains.gateway.api.GatewayConnectionHandle
import com.jetbrains.gateway.thinClientLink.LinkedClientManager
import com.jetbrains.rd.util.lifetime.LifetimeDefinition
import com.jetbrains.rd.util.lifetime.onTermination
import com.jetbrains.rd.util.reactive.adviseEternal
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.gateway.connection.IdeBackendActions
import software.aws.toolkits.jetbrains.gateway.connection.ThinClientTrackerService
import software.aws.toolkits.jetbrains.gateway.connection.caws.CawsCommandExecutor
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.jetbrains.utils.spinUntilValue
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import java.net.URI
import java.net.URLEncoder
import java.time.Duration
import java.util.concurrent.TimeoutException
import software.aws.toolkits.telemetry.Result as TelemetryResult

class StartBackend(
    private val gatewayHandle: GatewayConnectionHandle,
    private val remoteScriptPath: String,
    private val remoteProjectName: String?,
    private val executor: CawsCommandExecutor,
    private val lifetime: LifetimeDefinition,
    private val envId: String,
    private val isSmallInstance: Boolean
) : Step() {
    override val stepName: String = message("gateway.connection.workflow.start_ide")

    private val ideActions = IdeBackendActions(remoteScriptPath, remoteProjectName, executor)

    override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
        val (_, remoteLink) = startBackend(context, stepEmitter)
        val localLink = ideActions.forwardBackendToLocalhost(remoteLink, lifetime)
        context.throwIfCancelled()

        LOG.info { "Starting thin client with link: $localLink" }
        val clientHandle = ThinClientTrackerService.getInstance().associate(envId) {
            val start = System.currentTimeMillis()
            val thinClientHandle = try {
                LinkedClientManager.getInstance()
                    .startNewClient(lifetime, localLink, URLEncoder.encode(message("caws.workspace.backend.title"), Charsets.UTF_8)) {
                        CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                            project = null,
                            userId = lazilyGetUserId(),
                            result = TelemetryResult.Succeeded,
                            duration = System.currentTimeMillis() - start.toDouble(),
                            codecatalystDevEnvironmentWorkflowStep = "startThinClient",
                        )
                    }
            } catch (e: Throwable) {
                CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                    project = null,
                    userId = lazilyGetUserId(),
                    result = TelemetryResult.Failed,
                    duration = System.currentTimeMillis() - start.toDouble(),
                    codecatalystDevEnvironmentWorkflowStep = "startThinClient",
                    codecatalystDevEnvironmentWorkflowError = e.javaClass.simpleName
                )

                throw e
            }

            gatewayHandle to thinClientHandle
        }

        clientHandle.clientClosed.adviseEternal {
            // when client exits gateway handle should be closed to cleanup
            gatewayHandle.terminate()
            lifetime.terminate()
        }
    }

    private fun startBackend(context: Context, stepEmitter: StepEmitter): Pair<Long, URI> =
        spinUntilValue(Duration.ofMinutes(4)) {
            tryStartBackend(context, stepEmitter)
        }

    private fun tryStartBackend(context: Context, stepEmitter: StepEmitter): Pair<Long, URI>? {
        // check if backend is already running
        val initialConnectLink = ideActions.getGatewayConnectLink(gatewayLinkTimeout)
        if (initialConnectLink != null) {
            stepEmitter.emitMessageLine("Reusing existing backend instance at: $initialConnectLink", isError = false)
        }
        if (isSmallInstance) {
            runBlocking {
                delay(5000)
            }
        }

        val remoteLink = initialConnectLink ?: let {
            val backend = ideActions.startBackend()
            stepEmitter.attachProcess(backend)
            lifetime.onTermination {
                backend.destroyProcess()
            }

            if (isSmallInstance) {
                runBlocking {
                    delay(5000)
                }
            }

            val start = System.currentTimeMillis()

            val duration = Duration.ofMinutes(3)
            return@let try {
                spinUntilValue(duration = duration, interval = Duration.ofSeconds(5)) {
                    if (backend.isProcessTerminated) {
                        val message = when (backend.exitCode) {
                            7 -> message("caws.backend.error.expired")
                            else -> message("caws.backend.error.unknown", backend.exitCode.toString())
                        }

                        error(message)
                    }
                    context.throwIfCancelled()
                    ideActions.getGatewayConnectLink(gatewayLinkTimeout)
                }
            } catch (e: TimeoutException) {
                throw IllegalStateException("Backend did not start within $duration")
            } finally {
                val error = if (backend.isProcessTerminated) {
                    "exitCode: ${backend.exitCode}"
                } else {
                    null
                }

                CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                    project = null,
                    userId = lazilyGetUserId(),
                    result = if (error != null) TelemetryResult.Failed else TelemetryResult.Succeeded,
                    duration = System.currentTimeMillis() - start.toDouble(),
                    codecatalystDevEnvironmentWorkflowStep = "runIde",
                    codecatalystDevEnvironmentWorkflowError = error
                )
            }
        }

        context.throwIfCancelled()
        return remoteLink
    }

    companion object {
        private val LOG = getLogger<StartBackend>()
        private val gatewayLinkTimeout = Duration.ofSeconds(60)
    }
}
