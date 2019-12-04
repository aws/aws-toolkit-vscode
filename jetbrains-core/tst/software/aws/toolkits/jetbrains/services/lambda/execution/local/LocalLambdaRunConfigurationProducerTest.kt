// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.Location
import com.intellij.execution.PsiLocation
import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.ConfigurationFromContext
import com.intellij.execution.actions.RunConfigurationProducer
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.psi.PsiElement
import com.intellij.testFramework.MapDataContext
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.yaml.psi.YAMLFile
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.sam.findByLocation
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass

class LocalLambdaRunConfigurationProducerTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun validRunConfigurationIsCreated() {
        val psiClass = projectRule.fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public String handleRequest(String request) {
                    return request.toUpperCase();
                }
            }
            """
        )

        val lambdaMethod = psiClass.findMethodsByName("handleRequest", false).first()
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(lambdaMethod)
            assertThat(runConfiguration).isNotNull
            val configuration = runConfiguration?.configuration as LocalLambdaRunConfiguration
            assertThat(configuration.isUsingTemplate()).isFalse()
            assertThat(configuration.runtime()).isEqualTo(Runtime.JAVA8)
            assertThat(configuration.handler()).isEqualTo("com.example.LambdaHandler::handleRequest")
            assertThat(configuration.name).isEqualTo("[Local] LambdaHandler.handleRequest")
        }
    }

    @Test
    fun validRunConfigurationIsCreatedFromTemplate() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "template.yaml", """
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
        """.trimIndent()
            ) as YAMLFile
            val psiElement = psiFile.findByLocation("Resources.MyFunction")?.key ?: throw RuntimeException("Can't find function")
            val runConfiguration = createRunConfiguration(psiElement)
            assertThat(runConfiguration).isNotNull
            val configuration = runConfiguration?.configuration as LocalLambdaRunConfiguration
            assertThat(configuration.isUsingTemplate()).isTrue()
            assertThat(configuration.templateFile()).isEqualTo(psiFile.containingFile.virtualFile.path)
            assertThat(configuration.logicalId()).isEqualTo("MyFunction")
            assertThat(configuration.name).isEqualTo("[Local] MyFunction")
        }
    }

    @Test
    fun canRoundTripTemplateBasedConfiguration() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "template.yaml", """
Resources:
    MyFunction:
        Type: AWS::Serverless::Function
        Properties:
            Handler: helloworld.App::handleRequest
            Runtime: java8
        """.trimIndent()
            ) as YAMLFile
            val psiElement = psiFile.findByLocation("Resources.MyFunction")?.key ?: throw RuntimeException("Can't find function")
            val runConfiguration = createRunConfiguration(psiElement)

            val sut = RunConfigurationProducer.getInstance(LocalLambdaRunConfigurationProducer::class.java)

            assertThat(
                sut.isConfigurationFromContext(
                    runConfiguration?.configuration as LocalLambdaRunConfiguration,
                    createContext(psiElement, MapDataContext())
                )
            ).isTrue()
        }
    }

    @Test
    fun invalidLambdaIsNotCreated() {
        val psiClass = projectRule.fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public void handleRequest() {
                }
            }
            """
        )

        val lambdaMethod = psiClass.findMethodsByName("handleRequest", false).first()
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(lambdaMethod)
            assertThat(runConfiguration).isNull()
        }
    }

    private fun createRunConfiguration(psiElement: PsiElement): ConfigurationFromContext? {
        val dataContext = MapDataContext()
        val context = createContext(psiElement, dataContext)
        val producer = RunConfigurationProducer.getInstance(LocalLambdaRunConfigurationProducer::class.java)
        return producer.createConfigurationFromContext(context)
    }

    private fun createContext(psiClass: PsiElement, dataContext: MapDataContext): ConfigurationContext {
        dataContext.put(CommonDataKeys.PROJECT, projectRule.project)
        if (LangDataKeys.MODULE.getData(dataContext) == null) {
            dataContext.put(LangDataKeys.MODULE, ModuleUtilCore.findModuleForPsiElement(psiClass))
        }
        dataContext.put(Location.DATA_KEY, PsiLocation.fromPsiElement(psiClass))
        return ConfigurationContext.getFromContext(dataContext)
    }
}
