// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.codeInsight.CodeInsightSettings
import com.intellij.codeInsight.hint.HintManager
import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.VisualPosition
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.util.Disposer
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.messages.Topic
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import software.amazon.awssdk.core.exception.SdkServiceException
import software.amazon.awssdk.core.util.DefaultSdkAutoConstructList
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererException
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.FileContext
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.RecommendationsWithReferencesPreference
import software.amazon.awssdk.services.codewhispererruntime.model.ResourceNotFoundException
import software.amazon.awssdk.services.codewhispererruntime.model.SupplementalContext
import software.amazon.awssdk.services.codewhispererruntime.model.ThrottlingException
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorManager
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil.checkLeftContextKeywordsForJsonAndYaml
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil.getCaretPosition
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretPosition
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.FileContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SupplementalContextInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.model.WorkerContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CaretMovement
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.SUPPLEMENTAL_CONTEXT_TIMEOUT
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getCompletionType
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getTelemetryOptOutPreference
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyErrorCodeWhispererUsageLimit
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.promptReAuth
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CrossFileStrategy
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileContextProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.util.UtgStrategy
import software.aws.toolkits.jetbrains.utils.isInjectedText
import software.aws.toolkits.jetbrains.utils.isQExpired
import software.aws.toolkits.jetbrains.utils.isRunningOnCWNotSupportedRemoteBackend
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import java.util.concurrent.TimeUnit

@Service
class CodeWhispererService {
    fun showRecommendationsInPopup(
        editor: Editor,
        triggerTypeInfo: TriggerTypeInfo,
        latencyContext: LatencyContext
    ) {
        val project = editor.project ?: return
        if (!isCodeWhispererEnabled(project)) return

        latencyContext.credentialFetchingStart = System.nanoTime()

        if (isRunningOnCWNotSupportedRemoteBackend()) {
            showCodeWhispererInfoHint(editor, message("codewhisperer.trigger.ide.unsupported"))
            return
        }

        if (isQExpired(project)) {
            // The purpose to execute in the background is to hide the progress indicator UI
            val shouldReauth = ApplicationManager.getApplication().executeOnPooledThread<Boolean> {
                promptReAuth(project)
            }.get()

            if (shouldReauth) {
                return
            }
        }

        latencyContext.credentialFetchingEnd = System.nanoTime()
        val psiFile = runReadAction { PsiDocumentManager.getInstance(project).getPsiFile(editor.document) }

        if (psiFile == null) {
            LOG.debug { "No PSI file for the current document" }
            if (triggerTypeInfo.triggerType == CodewhispererTriggerType.OnDemand) {
                showCodeWhispererInfoHint(editor, message("codewhisperer.trigger.document.unsupported"))
            }
            return
        }
        val isInjectedFile = runReadAction { psiFile.isInjectedText() }
        if (isInjectedFile) return

        val requestContext = try {
            getRequestContext(triggerTypeInfo, editor, project, psiFile, latencyContext)
        } catch (e: Exception) {
            LOG.debug { e.message.toString() }
            CodeWhispererTelemetryService.getInstance().sendFailedServiceInvocationEvent(project, e::class.simpleName)
            return
        }

        val language = requestContext.fileContextInfo.programmingLanguage
        val leftContext = requestContext.fileContextInfo.caretContext.leftFileContext
        if (!language.isCodeCompletionSupported() || (checkLeftContextKeywordsForJsonAndYaml(leftContext, language.languageId))) {
            LOG.debug { "Programming language $language is not supported by CodeWhisperer" }
            if (triggerTypeInfo.triggerType == CodewhispererTriggerType.OnDemand) {
                showCodeWhispererInfoHint(
                    requestContext.editor,
                    message("codewhisperer.language.error", psiFile.fileType.name)
                )
            }
            return
        }

        LOG.debug {
            "Calling CodeWhisperer service, trigger type: ${triggerTypeInfo.triggerType}" +
                if (triggerTypeInfo.triggerType == CodewhispererTriggerType.AutoTrigger) {
                    ", auto-trigger type: ${triggerTypeInfo.automatedTriggerType}"
                } else {
                    ""
                }
        }

        val invocationStatus = CodeWhispererInvocationStatus.getInstance()
        if (invocationStatus.checkExistingInvocationAndSet()) {
            return
        }

        invokeCodeWhispererInBackground(requestContext)
    }

    private fun invokeCodeWhispererInBackground(requestContext: RequestContext) {
        val popup = CodeWhispererPopupManager.getInstance().initPopup()
        Disposer.register(popup) { CodeWhispererInvocationStatus.getInstance().finishInvocation() }

        val workerContexts = mutableListOf<WorkerContext>()
        // When popup is disposed we will cancel this coroutine. The only places popup can get disposed should be
        // from CodeWhispererPopupManager.cancelPopup() and CodeWhispererPopupManager.closePopup().
        // It's possible and ok that coroutine will keep running until the next time we check it's state.
        // As long as we don't show to the user extra info we are good.
        val coroutineScope = disposableCoroutineScope(popup)

        var states: InvocationContext? = null
        var lastRecommendationIndex = -1

        val responseIterable = CodeWhispererClientAdaptor.getInstance(requestContext.project).generateCompletionsPaginator(
            buildCodeWhispererRequest(
                requestContext.fileContextInfo,
                requestContext.supplementalContext,
                requestContext.customizationArn
            )
        )
        coroutineScope.launch {
            try {
                var startTime = System.nanoTime()
                requestContext.latencyContext.codewhispererPreprocessingEnd = System.nanoTime()
                requestContext.latencyContext.paginationAllCompletionsStart = System.nanoTime()
                CodeWhispererInvocationStatus.getInstance().setInvocationStart()
                var requestCount = 0
                for (response in responseIterable) {
                    requestCount++
                    val endTime = System.nanoTime()
                    val latency = TimeUnit.NANOSECONDS.toMillis(endTime - startTime).toDouble()
                    startTime = endTime
                    val requestId = response.responseMetadata().requestId()
                    val sessionId = response.sdkHttpResponse().headers().getOrDefault(KET_SESSION_ID, listOf(requestId))[0]
                    if (requestCount == 1) {
                        requestContext.latencyContext.codewhispererPostprocessingStart = System.nanoTime()
                        requestContext.latencyContext.paginationFirstCompletionTime = latency
                        requestContext.latencyContext.firstRequestId = requestId
                        CodeWhispererInvocationStatus.getInstance().setInvocationSessionId(sessionId)
                    }
                    if (response.nextToken().isEmpty()) {
                        requestContext.latencyContext.paginationAllCompletionsEnd = System.nanoTime()
                    }
                    val responseContext = ResponseContext(sessionId)
                    logServiceInvocation(requestId, requestContext, responseContext, response.completions(), latency, null)
                    lastRecommendationIndex += response.completions().size
                    ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_CODE_COMPLETION_PERFORMED)
                        .onSuccess(requestContext.fileContextInfo)
                    CodeWhispererTelemetryService.getInstance().sendServiceInvocationEvent(
                        requestId,
                        requestContext,
                        responseContext,
                        lastRecommendationIndex,
                        true,
                        latency,
                        null
                    )

                    val validatedResponse = validateResponse(response)

                    runInEdt {
                        // If delay is not met, add them to the worker queue and process them later.
                        // On first response, workers queue must be empty. If there's enough delay before showing,
                        // process CodeWhisperer UI rendering and workers queue will remain empty throughout this
                        // CodeWhisperer session. If there's not enough delay before showing, the CodeWhisperer UI rendering task
                        // will be added to the workers queue.
                        // On subsequent responses, if they see workers queue is not empty, it means the first worker
                        // task hasn't been finished yet, in this case simply add another task to the queue. If they
                        // see worker queue is empty, the previous tasks must have been finished before this. In this
                        // case render CodeWhisperer UI directly.
                        val workerContext = WorkerContext(requestContext, responseContext, validatedResponse, popup)
                        if (workerContexts.isNotEmpty()) {
                            workerContexts.add(workerContext)
                        } else {
                            if (states == null && !popup.isDisposed &&
                                !CodeWhispererInvocationStatus.getInstance().hasEnoughDelayToShowCodeWhisperer()
                            ) {
                                // It's the first response, and no enough delay before showing
                                projectCoroutineScope(requestContext.project).launch {
                                    while (!CodeWhispererInvocationStatus.getInstance().hasEnoughDelayToShowCodeWhisperer()) {
                                        delay(CodeWhispererConstants.POPUP_DELAY_CHECK_INTERVAL)
                                    }
                                    runInEdt {
                                        workerContexts.forEach {
                                            states = processCodeWhispererUI(it, states)
                                        }
                                        workerContexts.clear()
                                    }
                                }
                                workerContexts.add(workerContext)
                            } else {
                                // Have enough delay before showing for the first response, or it's subsequent responses
                                states = processCodeWhispererUI(workerContext, states)
                            }
                        }
                    }
                    if (!isActive) {
                        // If job is cancelled before we do another request, don't bother making
                        // another API call to save resources
                        LOG.debug { "Skipping sending remaining requests on CodeWhisperer session exit" }
                        break
                    }
                }
            } catch (e: Exception) {
                val requestId: String
                val sessionId: String
                val displayMessage: String

                if (
                    CodeWhispererConstants.Customization.invalidCustomizationExceptionPredicate(e) ||
                    e is ResourceNotFoundException
                ) {
                    (e as CodeWhispererRuntimeException)

                    requestId = e.requestId() ?: ""
                    sessionId = e.awsErrorDetails().sdkHttpResponse().headers().getOrDefault(KET_SESSION_ID, listOf(requestId))[0]
                    val exceptionType = e::class.simpleName
                    val responseContext = ResponseContext(sessionId)

                    CodeWhispererTelemetryService.getInstance().sendServiceInvocationEvent(
                        requestId,
                        requestContext,
                        responseContext,
                        lastRecommendationIndex,
                        false,
                        0.0,
                        exceptionType
                    )

                    LOG.debug {
                        "The provided customization ${requestContext.customizationArn} is not found, " +
                            "will fallback to the default and retry generate completion"
                    }
                    logServiceInvocation(requestId, requestContext, responseContext, emptyList(), null, exceptionType)

                    notifyWarn(
                        title = "",
                        content = message("codewhisperer.notification.custom.not_available"),
                        project = requestContext.project,
                        notificationActions = listOf(
                            NotificationAction.create(
                                message("codewhisperer.notification.custom.simple.button.select_another_customization")
                            ) { _, notification ->
                                CodeWhispererModelConfigurator.getInstance().showConfigDialog(requestContext.project)
                                notification.expire()
                            }
                        )
                    )
                    CodeWhispererInvocationStatus.getInstance().finishInvocation()
                    CodeWhispererInvocationStatus.getInstance().setInvocationComplete()

                    requestContext.customizationArn?.let { CodeWhispererModelConfigurator.getInstance().invalidateCustomization(it) }

                    projectCoroutineScope(requestContext.project).launch {
                        showRecommendationsInPopup(
                            requestContext.editor,
                            requestContext.triggerTypeInfo,
                            requestContext.latencyContext
                        )
                    }
                    return@launch
                } else if (e is CodeWhispererException) {
                    requestId = e.requestId() ?: ""
                    sessionId = e.awsErrorDetails().sdkHttpResponse().headers().getOrDefault(KET_SESSION_ID, listOf(requestId))[0]
                    displayMessage = e.awsErrorDetails().errorMessage() ?: message("codewhisperer.trigger.error.server_side")
                } else if (e is software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException) {
                    requestId = e.requestId() ?: ""
                    sessionId = e.awsErrorDetails().sdkHttpResponse().headers().getOrDefault(KET_SESSION_ID, listOf(requestId))[0]
                    displayMessage = e.awsErrorDetails().errorMessage() ?: message("codewhisperer.trigger.error.server_side")
                } else {
                    requestId = ""
                    sessionId = ""
                    val statusCode = if (e is SdkServiceException) e.statusCode() else 0
                    displayMessage =
                        if (statusCode >= 500) {
                            message("codewhisperer.trigger.error.server_side")
                        } else {
                            message("codewhisperer.trigger.error.client_side")
                        }
                    if (statusCode < 500) {
                        LOG.debug(e) { "Error invoking CodeWhisperer service" }
                    }
                }
                val exceptionType = e::class.simpleName
                val responseContext = ResponseContext(sessionId)
                CodeWhispererInvocationStatus.getInstance().setInvocationSessionId(sessionId)
                logServiceInvocation(requestId, requestContext, responseContext, emptyList(), null, exceptionType)
                CodeWhispererTelemetryService.getInstance().sendServiceInvocationEvent(
                    requestId,
                    requestContext,
                    responseContext,
                    lastRecommendationIndex,
                    false,
                    0.0,
                    exceptionType
                )

                if (e is ThrottlingException &&
                    e.message == CodeWhispererConstants.THROTTLING_MESSAGE
                ) {
                    CodeWhispererExplorerActionManager.getInstance().setSuspended(requestContext.project)
                    if (requestContext.triggerTypeInfo.triggerType == CodewhispererTriggerType.OnDemand) {
                        notifyErrorCodeWhispererUsageLimit(requestContext.project)
                    }
                } else {
                    if (requestContext.triggerTypeInfo.triggerType == CodewhispererTriggerType.OnDemand) {
                        // We should only show error hint when CodeWhisperer popup is not visible,
                        // and make it silent if CodeWhisperer popup is showing.
                        runInEdt {
                            if (!CodeWhispererInvocationStatus.getInstance().isPopupActive()) {
                                showCodeWhispererErrorHint(requestContext.editor, displayMessage)
                            }
                        }
                    }
                }
                CodeWhispererInvocationStatus.getInstance().finishInvocation()
                runInEdt {
                    states?.let {
                        CodeWhispererPopupManager.getInstance().updatePopupPanel(
                            it,
                            CodeWhispererPopupManager.getInstance().sessionContext
                        )
                    }
                }
            } finally {
                CodeWhispererInvocationStatus.getInstance().setInvocationComplete()
            }
        }
    }

    @RequiresEdt
    private fun processCodeWhispererUI(workerContext: WorkerContext, currStates: InvocationContext?): InvocationContext? {
        val requestContext = workerContext.requestContext
        val responseContext = workerContext.responseContext
        val response = workerContext.response
        val popup = workerContext.popup
        val requestId = response.responseMetadata().requestId()

        // At this point when we are in EDT, the state of the popup will be thread-safe
        // across this thread execution, so if popup is disposed, we will stop here.
        // This extra check is needed because there's a time between when we get the response and
        // when we enter the EDT.
        if (popup.isDisposed) {
            LOG.debug { "Stop showing CodeWhisperer recommendations on CodeWhisperer session exit. RequestId: $requestId" }
            return null
        }

        if (requestContext.editor.isDisposed) {
            LOG.debug { "Stop showing CodeWhisperer recommendations since editor is disposed. RequestId: $requestId" }
            CodeWhispererPopupManager.getInstance().cancelPopup(popup)
            return null
        }

        if (response.nextToken().isEmpty()) {
            CodeWhispererInvocationStatus.getInstance().finishInvocation()
        }

        val caretMovement = CodeWhispererEditorManager.getInstance().getCaretMovement(
            requestContext.editor,
            requestContext.caretPosition
        )
        val isPopupShowing: Boolean
        val nextStates: InvocationContext?
        if (currStates == null) {
            // first response
            nextStates = initStates(requestContext, responseContext, response, caretMovement, popup)
            isPopupShowing = false

            // receiving a null state means caret has moved backward or there's a conflict with
            // Intellisense popup, so we are going to cancel the job
            if (nextStates == null) {
                LOG.debug { "Cancelling popup and exiting CodeWhisperer session. RequestId: $requestId" }
                CodeWhispererPopupManager.getInstance().cancelPopup(popup)
                return null
            }
        } else {
            // subsequent responses
            nextStates = updateStates(currStates, response)
            isPopupShowing = checkRecommendationsValidity(currStates, false)
        }

        val hasAtLeastOneValid = checkRecommendationsValidity(nextStates, response.nextToken().isEmpty())

        // If there are no recommendations at all in this session, we need to manually send the user decision event here
        // since it won't be sent automatically later
        if (nextStates.recommendationContext.details.isEmpty() && response.nextToken().isEmpty()) {
            LOG.debug { "Received just an empty list from this session, requestId: $requestId" }
            CodeWhispererTelemetryService.getInstance().sendUserDecisionEvent(
                requestContext,
                responseContext,
                DetailContext(
                    requestId,
                    Completion.builder().build(),
                    Completion.builder().build(),
                    false,
                    false,
                    "",
                    CodewhispererCompletionType.Line
                ),
                -1,
                CodewhispererSuggestionState.Empty,
                nextStates.recommendationContext.details.size
            )
        }
        if (!hasAtLeastOneValid) {
            if (response.nextToken().isEmpty()) {
                LOG.debug { "None of the recommendations are valid, exiting CodeWhisperer session" }
                CodeWhispererPopupManager.getInstance().cancelPopup(popup)
                return null
            }
        } else {
            updateCodeWhisperer(nextStates, isPopupShowing)
        }
        return nextStates
    }

    private fun initStates(
        requestContext: RequestContext,
        responseContext: ResponseContext,
        response: GenerateCompletionsResponse,
        caretMovement: CaretMovement,
        popup: JBPopup
    ): InvocationContext? {
        val requestId = response.responseMetadata().requestId()
        val recommendations = response.completions()
        val visualPosition = requestContext.editor.caretModel.visualPosition

        if (CodeWhispererPopupManager.getInstance().hasConflictingPopups(requestContext.editor)) {
            LOG.debug { "Detect conflicting popup window with CodeWhisperer popup, not showing CodeWhisperer popup" }
            sendDiscardedUserDecisionEventForAll(requestContext, responseContext, recommendations)
            return null
        }
        if (caretMovement == CaretMovement.MOVE_BACKWARD) {
            LOG.debug { "Caret moved backward, discarding all of the recommendations. Request ID: $requestId" }
            sendDiscardedUserDecisionEventForAll(requestContext, responseContext, recommendations)
            return null
        }
        val userInputOriginal = CodeWhispererEditorManager.getInstance().getUserInputSinceInvocation(
            requestContext.editor,
            requestContext.caretPosition.offset
        )
        val userInput =
            if (caretMovement == CaretMovement.NO_CHANGE) {
                LOG.debug { "Caret position not changed since invocation. Request ID: $requestId" }
                ""
            } else {
                userInputOriginal.trimStart().also {
                    LOG.debug {
                        "Caret position moved forward since invocation. Request ID: $requestId, " +
                            "user input since invocation: $userInputOriginal, " +
                            "user input without leading spaces: $it"
                    }
                }
            }
        val detailContexts = CodeWhispererRecommendationManager.getInstance().buildDetailContext(
            requestContext,
            userInput,
            recommendations,
            requestId
        )
        val recommendationContext = RecommendationContext(detailContexts, userInputOriginal, userInput, visualPosition)
        return buildInvocationContext(requestContext, responseContext, recommendationContext, popup)
    }

    private fun updateStates(
        states: InvocationContext,
        response: GenerateCompletionsResponse
    ): InvocationContext {
        val recommendationContext = states.recommendationContext
        val details = recommendationContext.details
        val newDetailContexts = CodeWhispererRecommendationManager.getInstance().buildDetailContext(
            states.requestContext,
            recommendationContext.userInputSinceInvocation,
            response.completions(),
            response.responseMetadata().requestId()
        )
        Disposer.dispose(states)

        val updatedStates = states.copy(
            recommendationContext = recommendationContext.copy(details = details + newDetailContexts)
        )
        Disposer.register(states.popup, updatedStates)
        CodeWhispererPopupManager.getInstance().initPopupListener(updatedStates)
        return updatedStates
    }

    private fun checkRecommendationsValidity(states: InvocationContext, showHint: Boolean): Boolean {
        val details = states.recommendationContext.details

        // set to true when at least one is not discarded or empty
        val hasAtLeastOneValid = details.any { !it.isDiscarded && it.recommendation.content().isNotEmpty() }

        if (!hasAtLeastOneValid && showHint && states.requestContext.triggerTypeInfo.triggerType == CodewhispererTriggerType.OnDemand) {
            showCodeWhispererInfoHint(
                states.requestContext.editor,
                message("codewhisperer.popup.no_recommendations")
            )
        }
        return hasAtLeastOneValid
    }

    private fun updateCodeWhisperer(states: InvocationContext, recommendationAdded: Boolean) {
        CodeWhispererPopupManager.getInstance().changeStates(states, 0, "", true, recommendationAdded)
    }

    private fun sendDiscardedUserDecisionEventForAll(
        requestContext: RequestContext,
        responseContext: ResponseContext,
        recommendations: List<Completion>
    ) {
        val detailContexts = recommendations.map {
            DetailContext("", it, it, true, false, "", getCompletionType(it))
        }
        val recommendationContext = RecommendationContext(detailContexts, "", "", VisualPosition(0, 0))

        CodeWhispererTelemetryService.getInstance().sendUserDecisionEventForAll(
            requestContext,
            responseContext,
            recommendationContext,
            SessionContext(),
            false
        )
    }

    fun getRequestContext(
        triggerTypeInfo: TriggerTypeInfo,
        editor: Editor,
        project: Project,
        psiFile: PsiFile,
        latencyContext: LatencyContext
    ): RequestContext {
        // 1. file context
        val fileContext: FileContextInfo = runReadAction { FileContextProvider.getInstance(project).extractFileContext(editor, psiFile) }

        // the upper bound for supplemental context duration is 50ms
        // 2. supplemental context
        val startFetchingTimestamp = System.currentTimeMillis()
        val isTstFile = FileContextProvider.getInstance(project).isTestFile(psiFile)
        val supplementalContext = runBlocking {
            try {
                withTimeout(SUPPLEMENTAL_CONTEXT_TIMEOUT) {
                    FileContextProvider.getInstance(project).extractSupplementalFileContext(psiFile, fileContext)
                }
            } catch (e: Exception) {
                if (e is TimeoutCancellationException) {
                    LOG.debug {
                        "Supplemental context fetch timed out in ${System.currentTimeMillis() - startFetchingTimestamp}ms"
                    }
                    SupplementalContextInfo(
                        isUtg = isTstFile,
                        contents = emptyList(),
                        latency = System.currentTimeMillis() - startFetchingTimestamp,
                        targetFileName = fileContext.filename,
                        strategy = if (isTstFile) UtgStrategy.Empty else CrossFileStrategy.Empty
                    )
                } else {
                    LOG.debug { "Run into unexpected error when fetching supplemental context, error: ${e.message}" }
                    null
                }
            }
        }

        // 3. caret position
        val caretPosition = runReadAction { getCaretPosition(editor) }

        // 4. connection
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())

        // 5. customization
        val customizationArn = CodeWhispererModelConfigurator.getInstance().activeCustomization(project)?.arn

        return RequestContext(project, editor, triggerTypeInfo, caretPosition, fileContext, supplementalContext, connection, latencyContext, customizationArn)
    }

    fun validateResponse(response: GenerateCompletionsResponse): GenerateCompletionsResponse {
        // If contentSpans in reference are not consistent with content(recommendations),
        // remove the incorrect references.
        val validatedRecommendations = response.completions().map {
            val validReferences = it.hasReferences() && it.references().isNotEmpty() &&
                it.references().none { reference ->
                    val span = reference.recommendationContentSpan()
                    span.start() > span.end() || span.start() < 0 || span.end() > it.content().length
                }
            if (validReferences) {
                it
            } else {
                it.toBuilder().references(DefaultSdkAutoConstructList.getInstance()).build()
            }
        }

        return response.toBuilder().completions(validatedRecommendations).build()
    }

    private fun buildInvocationContext(
        requestContext: RequestContext,
        responseContext: ResponseContext,
        recommendationContext: RecommendationContext,
        popup: JBPopup
    ): InvocationContext {
        addPopupChildDisposables(popup)
        // Creating a disposable for managing all listeners lifecycle attached to the popup.
        // previously(before pagination) we use popup as the parent disposable.
        // After pagination, listeners need to be updated as states are updated, for the same popup,
        // so disposable chain becomes popup -> disposable -> listeners updates, and disposable gets replaced on every
        // state update.
        val states = InvocationContext(requestContext, responseContext, recommendationContext, popup)
        Disposer.register(popup, states)
        CodeWhispererPopupManager.getInstance().initPopupListener(states)
        return states
    }

    private fun addPopupChildDisposables(popup: JBPopup) {
        val originalTabExitsBracketsAndQuotes = CodeInsightSettings.getInstance().TAB_EXITS_BRACKETS_AND_QUOTES
        CodeInsightSettings.getInstance().TAB_EXITS_BRACKETS_AND_QUOTES = false
        Disposer.register(popup) {
            CodeInsightSettings.getInstance().TAB_EXITS_BRACKETS_AND_QUOTES = originalTabExitsBracketsAndQuotes
        }
        val originalAutoPopupCompletionLookup = CodeInsightSettings.getInstance().AUTO_POPUP_COMPLETION_LOOKUP
        CodeInsightSettings.getInstance().AUTO_POPUP_COMPLETION_LOOKUP = false
        Disposer.register(popup) {
            CodeInsightSettings.getInstance().AUTO_POPUP_COMPLETION_LOOKUP = originalAutoPopupCompletionLookup
        }
        Disposer.register(popup) {
            CodeWhispererPopupManager.getInstance().reset()
        }
    }

    private fun logServiceInvocation(
        requestId: String,
        requestContext: RequestContext,
        responseContext: ResponseContext,
        recommendations: List<Completion>,
        latency: Double?,
        exceptionType: String?
    ) {
        val recommendationLogs = recommendations.map { it.content().trimEnd() }
            .reduceIndexedOrNull { index, acc, recommendation -> "$acc\n[${index + 1}]\n$recommendation" }
        LOG.info {
            "SessionId: ${responseContext.sessionId}, " +
                "RequestId: $requestId, " +
                "Jetbrains IDE: ${ApplicationInfo.getInstance().fullApplicationName}, " +
                "IDE version: ${ApplicationInfo.getInstance().apiVersion}, " +
                "Filename: ${requestContext.fileContextInfo.filename}, " +
                "Left context of current line: ${requestContext.fileContextInfo.caretContext.leftContextOnCurrentLine}, " +
                "Cursor line: ${requestContext.caretPosition.line}, " +
                "Caret offset: ${requestContext.caretPosition.offset}, " +
                (latency?.let { "Latency: $latency, " } ?: "") +
                (exceptionType?.let { "Exception Type: $it, " } ?: "") +
                "Recommendations: \n${recommendationLogs ?: "None"}"
        }
    }

    fun canDoInvocation(editor: Editor, type: CodewhispererTriggerType): Boolean {
        editor.project?.let {
            if (!isCodeWhispererEnabled(it)) {
                return false
            }
        }

        if (type == CodewhispererTriggerType.AutoTrigger && !CodeWhispererExplorerActionManager.getInstance().isAutoEnabled()) {
            LOG.debug { "CodeWhisperer auto-trigger is disabled, not invoking service" }
            return false
        }

        if (CodeWhispererPopupManager.getInstance().hasConflictingPopups(editor)) {
            LOG.debug { "Find other active popup windows before triggering CodeWhisperer, not invoking service" }
            return false
        }

        if (CodeWhispererInvocationStatus.getInstance().isPopupActive()) {
            LOG.debug { "Find an existing CodeWhisperer popup window before triggering CodeWhisperer, not invoking service" }
            return false
        }
        return true
    }

    fun showCodeWhispererInfoHint(editor: Editor, message: String) {
        HintManager.getInstance().showInformationHint(editor, message, HintManager.UNDER)
    }

    fun showCodeWhispererErrorHint(editor: Editor, message: String) {
        HintManager.getInstance().showErrorHint(editor, message, HintManager.UNDER)
    }

    companion object {
        private val LOG = getLogger<CodeWhispererService>()
        val CODEWHISPERER_CODE_COMPLETION_PERFORMED: Topic<CodeWhispererCodeCompletionServiceListener> = Topic.create(
            "CodeWhisperer code completion service invoked",
            CodeWhispererCodeCompletionServiceListener::class.java
        )

        fun getInstance(): CodeWhispererService = service()
        const val KET_SESSION_ID = "x-amzn-SessionId"
        private var reAuthPromptShown = false

        fun markReAuthPromptShown() {
            reAuthPromptShown = true
        }

        fun hasReAuthPromptBeenShown() = reAuthPromptShown

        fun buildCodeWhispererRequest(
            fileContextInfo: FileContextInfo,
            supplementalContext: SupplementalContextInfo?,
            customizationArn: String?
        ): GenerateCompletionsRequest {
            val programmingLanguage = ProgrammingLanguage.builder()
                .languageName(fileContextInfo.programmingLanguage.toCodeWhispererRuntimeLanguage().languageId)
                .build()
            val fileContext = FileContext.builder()
                .leftFileContent(fileContextInfo.caretContext.leftFileContext)
                .rightFileContent(fileContextInfo.caretContext.rightFileContext)
                .filename(fileContextInfo.filename)
                .programmingLanguage(programmingLanguage)
                .build()
            val supplementalContexts = supplementalContext?.contents?.map {
                SupplementalContext.builder()
                    .content(it.content)
                    .filePath(it.path)
                    .build()
            }.orEmpty()
            val includeCodeWithReference = if (CodeWhispererSettings.getInstance().isIncludeCodeWithReference()) {
                RecommendationsWithReferencesPreference.ALLOW
            } else {
                RecommendationsWithReferencesPreference.BLOCK
            }

            return GenerateCompletionsRequest.builder()
                .fileContext(fileContext)
                .supplementalContexts(supplementalContexts)
                .referenceTrackerConfiguration { it.recommendationsWithReferences(includeCodeWithReference) }
                .customizationArn(customizationArn)
                .optOutPreference(getTelemetryOptOutPreference())
                .build()
        }
    }
}

data class RequestContext(
    val project: Project,
    val editor: Editor,
    val triggerTypeInfo: TriggerTypeInfo,
    val caretPosition: CaretPosition,
    val fileContextInfo: FileContextInfo,
    val supplementalContext: SupplementalContextInfo?,
    val connection: ToolkitConnection?,
    val latencyContext: LatencyContext,
    val customizationArn: String?
)

data class ResponseContext(
    val sessionId: String,
)

interface CodeWhispererCodeCompletionServiceListener {
    fun onSuccess(fileContextInfo: FileContextInfo) {}
}
