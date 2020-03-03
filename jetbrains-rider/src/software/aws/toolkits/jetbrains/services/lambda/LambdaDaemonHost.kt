// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.Executor
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.execution.RunManager
import com.intellij.execution.configurations.ConfigurationTypeUtil
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.lang.LanguageUtil
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.project.Project
import com.intellij.psi.SmartPointerManager
import com.jetbrains.rdclient.util.idea.LifetimedProjectComponent
import com.jetbrains.rider.model.lambdaDaemonModel
import com.jetbrains.rider.projectView.solution
import software.aws.toolkits.jetbrains.services.lambda.dotnet.DotNetLambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.dotnet.element.RiderLambdaHandlerFakePsiElement
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfigurationProducer
import software.aws.toolkits.jetbrains.services.lambda.upload.CreateLambdaFunction
import software.aws.toolkits.jetbrains.utils.DotNetRuntimeUtils

/**
 * Lambda Host class is used for communication with ReSharper backend through protocol
 * for all operation related to AWS Lambda.
 */
@Suppress("ComponentNotRegistered")
class LambdaDaemonHost(project: Project) : LifetimedProjectComponent(project) {

    val model = project.solution.lambdaDaemonModel

    init {
        initRunLambdaHandler()
        initDebugLambdaHandler()
        initCreateNewLambdaHandler()
    }

    private fun initRunLambdaHandler() =
        model.runLambda.advise(componentLifetime) { lambdaRequest ->
            runConfiguration(
                methodName = lambdaRequest.methodName,
                handler = lambdaRequest.handler,
                executor = DefaultRunExecutor.getRunExecutorInstance()
            )
        }

    private fun initDebugLambdaHandler() =
        model.debugLambda.advise(componentLifetime) { lambdaRequest ->
            runConfiguration(
                methodName = lambdaRequest.methodName,
                handler = lambdaRequest.handler,
                executor = DefaultDebugExecutor.getDebugExecutorInstance()
            )
        }

    private fun initCreateNewLambdaHandler() =
        model.createNewLambda.advise(componentLifetime) { createLambdaRequest ->
            val handler = createLambdaRequest.handler

            val handlerResolver = DotNetLambdaHandlerResolver()
            val fieldId = handlerResolver.getFieldIdByHandlerName(project, handler)
            val psiElement = RiderLambdaHandlerFakePsiElement(project, handler, fieldId).navigationElement
            val smartPsiElementPointer = SmartPointerManager.createPointer(psiElement)

            val action = CreateLambdaFunction(
                handlerName = handler,
                elementPointer = smartPsiElementPointer,
                lambdaHandlerResolver = handlerResolver
            )

            val contextMap = mapOf(
                LangDataKeys.LANGUAGE.name to LanguageUtil.getRootLanguage(psiElement)
            )

            ActionUtil.invokeAction(
                action,
                SimpleDataContext.getSimpleContext(contextMap, SimpleDataContext.getProjectContext(project)),
                ActionPlaces.EDITOR_GUTTER_POPUP,
                null,
                null
            )
        }

    private fun runConfiguration(methodName: String, handler: String, executor: Executor) {
        val runManager = RunManager.getInstance(project)

        // Find configuration if exists
        val configurationType = ConfigurationTypeUtil.findConfigurationType(LambdaRunConfigurationType::class.java)
        val runConfigurations = runManager.getConfigurationsList(configurationType)

        var settings = runConfigurations.filterIsInstance<LocalLambdaRunConfiguration>().firstOrNull { configuration ->
            configuration.handler() == handler
        }?.let { configuration ->
            runManager.findSettings(configuration)
        }

        // Or generate a new one if configuration is missing
        if (settings == null) {
            val factory = LocalLambdaRunConfigurationProducer.getFactory()
            val template = runManager.getConfigurationTemplate(factory)

            val configuration = template.configuration as LocalLambdaRunConfiguration
            val runtime = DotNetRuntimeUtils.getCurrentDotNetCoreRuntime()

            LocalLambdaRunConfigurationProducer.setAccountOptions(configuration)
            configuration.useHandler(runtime, handler)

            val configurationToAdd = factory.createConfiguration("[Local] $methodName", configuration)
            settings = runManager.createConfiguration(configurationToAdd, factory)

            runManager.setTemporaryConfiguration(settings)
            runManager.addConfiguration(settings)
        }

        runManager.selectedConfiguration = settings

        ProgramRunnerUtil.executeConfiguration(settings, executor)
    }
}
