// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.customization

import com.intellij.notification.NotificationAction
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import com.intellij.util.xmlb.annotations.MapAnnotation
import com.intellij.util.xmlb.annotations.Property
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererFeatureConfigService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.calculateIfIamIdentityCenterConnection
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message
import java.util.Collections
import java.util.concurrent.atomic.AtomicBoolean

typealias CodeWhispererModelConfigurator = migration.software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator

private fun notifyInvalidSelectedCustomization(project: Project) {
    notifyWarn(
        title = message("codewhisperer.custom.dialog.title"),
        content = message("codewhisperer.notification.custom.not_available"),
        project = project,
        notificationActions = listOf(
            NotificationAction.create(message("codewhisperer.notification.custom.simple.button.select_another_customization")) { _, notification ->
                CodeWhispererModelConfigurator.getInstance().showConfigDialog(project)
                notification.expire()
            }
        )
    )
}

private fun notifyNewCustomization(project: Project) {
    notifyInfo(
        title = message("codewhisperer.custom.dialog.title"),
        content = message("codewhisperer.notification.custom.new_customization"),
        project = project,
        notificationActions = listOf(
            NotificationAction.createSimpleExpiring(message("codewhisperer.notification.custom.simple.button.select_customization")) {
                CodeWhispererModelConfigurator.getInstance().showConfigDialog(project)
            }
        )
    )
}

@Service(Service.Level.APP)
@State(name = "codewhispererCustomizationStates", storages = [Storage("aws.xml")])
class DefaultCodeWhispererModelConfigurator : CodeWhispererModelConfigurator, PersistentStateComponent<CodeWhispererCustomizationState>, Disposable {
    // TODO: refactor and clean these states, probably not need all the follwing and it's hard to maintain
    // Map to store connectionId to its active customization
    private val connectionIdToActiveCustomizationArn = Collections.synchronizedMap<String, CodeWhispererCustomization>(mutableMapOf())

    // Map to store connectionId to its listAvailableCustomizations result last time
    private val connectionToCustomizationsShownLastTime = mutableMapOf<String, MutableList<String>>()

    private val connectionIdToIsAllowlisted = Collections.synchronizedMap<String, Boolean>(mutableMapOf())

    private val connectionToCustomizationUiItems: MutableMap<String, List<CustomizationUiItem>?> = Collections.synchronizedMap(mutableMapOf())

    private val hasShownNewCustomizationNotification = AtomicBoolean(false)

    override fun showConfigDialog(project: Project) {
        runInEdt {
            calculateIfIamIdentityCenterConnection(project) {
                CodeWhispererCustomizationDialog(project, connectionToCustomizationUiItems[it.id]).show()
                connectionToCustomizationUiItems[it.id] = null
            }
        }
    }

    @RequiresBackgroundThread
    override fun listCustomizations(project: Project, passive: Boolean): List<CustomizationUiItem>? =
        calculateIfIamIdentityCenterConnection(project) {
            // 1. invoke API and get result
            val listAvailableCustomizationsResult = try {
                CodeWhispererClientAdaptor.getInstance(project).listAvailableCustomizations()
            } catch (e: Exception) {
                val requestId = (e as? CodeWhispererRuntimeException)?.requestId()
                val logMessage = if (CodeWhispererConstants.Customization.noAccessToCustomizationExceptionPredicate(e)) {
                    // TODO: not required for non GP users
                    "ListAvailableCustomizations: connection ${it.id} is not allowlisted, requestId: ${requestId.orEmpty()}"
                } else {
                    "ListAvailableCustomizations: failed due to unknown error ${e.message}, requestId: ${requestId.orEmpty()}"
                }

                LOG.debug { logMessage }
                null
            }

            // 2. get diff
            val previousCustomizationsShapshot = connectionToCustomizationsShownLastTime.getOrElse(it.id) { emptyList() }
            val diff = listAvailableCustomizationsResult?.filterNot { customization -> previousCustomizationsShapshot.contains(customization.arn) }?.toSet()

            // 3 if passive,
            //   (1) update allowlisting
            //   (2) prompt "You have New Customizations" toast notification (only show once)
            //
            //   if not passive,
            //   (1) update the customization list snapshot (seen by users last time) if it will be displayed
            if (passive) {
                connectionIdToIsAllowlisted[it.id] = listAvailableCustomizationsResult != null
                if (diff?.isNotEmpty() == true && !hasShownNewCustomizationNotification.getAndSet(true)) {
                    notifyNewCustomization(project)
                }
            } else {
                listAvailableCustomizationsResult?.let { customizations ->
                    connectionToCustomizationsShownLastTime[it.id] = customizations.map { customization -> customization.arn }.toMutableList()
                }
            }

            // 4. invalidate selected customization if
            //    (1) the API call failed
            //    (2) the selected customization is not in the resultset of API call
            activeCustomization(project)?.let { activeCustom ->
                if (listAvailableCustomizationsResult == null) {
                    invalidateSelectedAndNotify(project)
                } else if (!listAvailableCustomizationsResult.any { latestCustom -> latestCustom.arn == activeCustom.arn }) {
                    invalidateSelectedAndNotify(project)
                }
            }

            // 5. transform result to UI items and return
            val customizationUiItems = if (diff != null) {
                listAvailableCustomizationsResult.let { customizations ->
                    val nameToCount = customizations.groupingBy { customization -> customization.name }.eachCount()

                    customizations.map { customization ->
                        CustomizationUiItem(
                            customization,
                            isNew = diff.contains(customization),
                            shouldPrefixAccountId = (nameToCount[customization.name] ?: 0) > 1
                        )
                    }
                }
            } else {
                null
            }
            connectionToCustomizationUiItems[it.id] = customizationUiItems

            return@calculateIfIamIdentityCenterConnection customizationUiItems
        }

    override fun activeCustomization(project: Project): CodeWhispererCustomization? {
        val result = calculateIfIamIdentityCenterConnection(project) { connectionIdToActiveCustomizationArn[it.id] }

        // A/B case
        val customizationArnFromAB = CodeWhispererFeatureConfigService.getInstance().getCustomizationArnOverride()
        if (customizationArnFromAB.isEmpty()) return result
        return CodeWhispererCustomization(
            arn = customizationArnFromAB,
            name = result?.name.orEmpty(),
            description = result?.description
        )
    }

    override fun switchCustomization(project: Project, newCustomization: CodeWhispererCustomization?) {
        calculateIfIamIdentityCenterConnection(project) {
            val oldCus = connectionIdToActiveCustomizationArn[it.id]
            if (oldCus != newCustomization) {
                newCustomization?.let { newCus ->
                    connectionIdToActiveCustomizationArn[it.id] = newCus
                } ?: run {
                    connectionIdToActiveCustomizationArn.remove(it.id)
                }

                LOG.debug { "Switch from customization $oldCus to $newCustomization" }

                CodeWhispererCustomizationListener.notifyCustomUiUpdate()
            }
        }
    }

    override fun invalidateCustomization(arn: String) {
        LOG.debug { "Invalidate customization arn: $arn" }
        connectionIdToActiveCustomizationArn.entries.removeIf { (_, v) -> v.arn == arn }
        CodeWhispererCustomizationListener.notifyCustomUiUpdate()
    }

    /**
     * @return boolean flag indicates if the CodeWhisperer connection associated with this project is allowlisted to Customization feat or not
     * This method will return the result in memory first and fallback to false if there is no value exist in the memory,
     * then will try fetch the latest from the server in the background thread and update the UI correspondingly
     */
    override fun shouldDisplayCustomNode(project: Project, forceUpdate: Boolean): Boolean = if (ApplicationManager.getApplication().isUnitTestMode) {
        false
    } else {
        calculateIfIamIdentityCenterConnection(project) {
            val cachedValue = connectionIdToIsAllowlisted[it.id]
            when (cachedValue) {
                true -> true

                null -> run {
                    ApplicationManager.getApplication().executeOnPooledThread {
                        listCustomizations(project, passive = true)
                    }

                    false
                }

                false -> run {
                    if (forceUpdate) {
                        ApplicationManager.getApplication().executeOnPooledThread {
                            listCustomizations(project, passive = true)
                        }
                    }

                    cachedValue
                }
            }
        } ?: false
    }

    override fun getNewUpdate(connectionId: String) = connectionToCustomizationUiItems[connectionId]

    override fun getState(): CodeWhispererCustomizationState {
        val state = CodeWhispererCustomizationState()
        state.connectionIdToActiveCustomizationArn.putAll(this.connectionIdToActiveCustomizationArn)
        state.previousAvailableCustomizations.putAll(this.connectionToCustomizationsShownLastTime)

        return state
    }

    override fun loadState(state: CodeWhispererCustomizationState) {
        connectionIdToActiveCustomizationArn.clear()
        connectionIdToActiveCustomizationArn.putAll(state.connectionIdToActiveCustomizationArn)

        connectionToCustomizationsShownLastTime.clear()
        connectionToCustomizationsShownLastTime.putAll(state.previousAvailableCustomizations)
    }

    override fun dispose() {}

    private fun invalidateSelectedAndNotify(project: Project) {
        activeCustomization(project)?.let { selectedCustom ->
            val arn = selectedCustom.arn
            switchCustomization(project, null)
            invalidateCustomization(arn)
            runInEdt(ModalityState.any()) {
                notifyInvalidSelectedCustomization(project)
            }

            CodeWhispererCustomizationListener.notifyCustomUiUpdate()
        }
    }

    companion object {
        private val LOG = getLogger<CodeWhispererModelConfigurator>()
    }
}

class CodeWhispererCustomizationState : BaseState() {
    @get:Property
    @get:MapAnnotation
    val connectionIdToActiveCustomizationArn by map<String, CodeWhispererCustomization>()

    @get:Property
    @get:MapAnnotation
    val previousAvailableCustomizations by map<String, MutableList<String>>()
}

data class CustomizationUiItem(
    val customization: CodeWhispererCustomization,
    val isNew: Boolean,
    val shouldPrefixAccountId: Boolean
)
