// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.openapi.ui.MessageDialogBuilder
import com.jetbrains.rdserver.unattendedHost.UnattendedStatusUtil
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.sono.CodeCatalystCredentialManager
import software.aws.toolkits.jetbrains.services.caws.CawsConstants
import software.aws.toolkits.jetbrains.services.caws.envclient.CawsEnvironmentClient
import software.aws.toolkits.jetbrains.services.caws.envclient.models.UpdateActivityRequest
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.time.Instant
import java.time.temporal.ChronoUnit

class DevEnvStatusWatcher : StartupActivity {

    companion object {
        private val LOG = getLogger<DevEnvStatusWatcher>()
    }

    override fun runActivity(project: Project) {
        if (!isCodeCatalystDevEnv()) {
            return
        }
        val connection = CodeCatalystCredentialManager.getInstance(project).getConnectionSettings()
            ?: error("Failed to fetch connection settings from Dev Environment")
        val envId = System.getenv(CawsConstants.CAWS_ENV_ID_VAR) ?: error("envId env var null")
        val org = System.getenv(CawsConstants.CAWS_ENV_ORG_NAME_VAR) ?: error("space env var null")
        val projectName = System.getenv(CawsConstants.CAWS_ENV_PROJECT_NAME_VAR) ?: error("project env var null")
        val client = connection.awsClient<CodeCatalystClient>()
        val coroutineScope = projectCoroutineScope(project)
        coroutineScope.launch(getCoroutineBgContext()) {
            val initialEnv = client.getDevEnvironment {
                it.id(envId)
                it.spaceName(org)
                it.projectName(projectName)
            }
            val inactivityTimeout = initialEnv.inactivityTimeoutMinutes()
            if (inactivityTimeout == 0) {
                LOG.info { "Dev environment inactivity timeout is 0, not monitoring" }
                return@launch
            }
            val inactivityTimeoutInSeconds = inactivityTimeout * 60

            // ensure the JetBrains inactivity tracker and the activity api are in sync
            val jbActivityStatusJson = UnattendedStatusUtil.getStatus()
            val jbActivityStatus = jbActivityStatusJson.projects?.first()?.secondsSinceLastControllerActivity ?: 0
            notifyBackendOfActivity((getActivityTime(jbActivityStatus).toString()))
            var secondsSinceLastControllerActivity = jbActivityStatus

            while (true) {
                val response = checkHeartbeat(secondsSinceLastControllerActivity, inactivityTimeoutInSeconds, project)
                if (response.first) return@launch
                delay(30000)
                secondsSinceLastControllerActivity = response.second
            }
        }
    }

    // This function returns a Pair The first value is a boolean indicating if the API returned the last recorded activity.
    // If inactivity tracking is disabled or if the value returned by the API is unparseable, the heartbeat is not sent
    // The second value indicates the seconds since last activity as recorded by JB in the most recent run
    fun checkHeartbeat(
        secondsSinceLastControllerActivity: Long,
        inactivityTimeoutInSeconds: Int,
        project: Project
    ): Pair<Boolean, Long> {
        val lastActivityTime = getJbRecordedActivity()

        if (lastActivityTime < secondsSinceLastControllerActivity) {
            // update the API in case of any activity
            notifyBackendOfActivity((getActivityTime(lastActivityTime).toString()))
        }

        val lastRecordedActivityTime = getLastRecordedApiActivity()
        if (lastRecordedActivityTime == null) {
            LOG.error { "Couldn't retrieve last recorded activity from API" }
            return Pair(true, lastActivityTime)
        }
        val durationRecordedSinceLastActivity = Instant.now().toEpochMilli().minus(lastRecordedActivityTime.toLong())
        val secondsRecordedSinceLastActivity = durationRecordedSinceLastActivity / 1000

        if (secondsRecordedSinceLastActivity >= (inactivityTimeoutInSeconds - 300)) {
            try {
                val inactivityDurationInMinutes = secondsRecordedSinceLastActivity / 60
                val ans = runBlocking {
                    val continueWorking = withContext(getCoroutineUiContext()) {
                        return@withContext MessageDialogBuilder.okCancel(
                            message("caws.devenv.continue.working.after.timeout.title"),
                            message("caws.devenv.continue.working.after.timeout", inactivityDurationInMinutes)
                        ).ask(project)
                    }
                    return@runBlocking continueWorking
                }

                if (ans) {
                    notifyBackendOfActivity(getActivityTime().toString())
                }
            } catch (e: Exception) {
                val preMessage = "Error while checking if Dev Environment should continue working"
                LOG.error(e) { preMessage }
                notifyError(preMessage, e.message.toString())
            }
        }
        return Pair(false, lastActivityTime)
    }

    fun getLastRecordedApiActivity(): String? = CawsEnvironmentClient.getInstance().getActivity()?.timestamp

    fun getJbRecordedActivity(): Long {
        val statusJson = UnattendedStatusUtil.getStatus()
        val lastActivityTime = statusJson.projects?.first()?.secondsSinceLastControllerActivity ?: 0
        return lastActivityTime
    }

    fun notifyBackendOfActivity(timestamp: String = Instant.now().toEpochMilli().toString()) {
        val request = UpdateActivityRequest(
            timestamp = timestamp
        )
        CawsEnvironmentClient.getInstance().putActivityTimestamp(request)
    }

    private fun getActivityTime(secondsSinceLastActivity: Long = 0): Long = Instant.now().minus(secondsSinceLastActivity, ChronoUnit.SECONDS).toEpochMilli()
}
