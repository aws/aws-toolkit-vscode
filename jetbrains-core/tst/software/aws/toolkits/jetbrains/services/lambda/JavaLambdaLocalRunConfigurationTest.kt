// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.compiler.CompilerTestUtil
import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.Output
import com.intellij.execution.OutputListener
import com.intellij.execution.RunManager
import com.intellij.execution.RunnerRegistry
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.command.undo.UndoManager
import com.intellij.openapi.compiler.CompileContext
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.compiler.CompilerMessageCategory
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.projectRoots.impl.JavaAwareProjectJdkTableImpl
import com.intellij.openapi.roots.CompilerProjectExtension
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.equalToIgnoringWhiteSpace
import org.hamcrest.Matchers.isEmptyString
import org.hamcrest.Matchers.notNullValue
import org.intellij.lang.annotations.Language
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.lambda.local.LambdaLocalRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.local.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.testutils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.testutils.rules.addClass
import software.aws.toolkits.jetbrains.testutils.rules.addModule
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

class JavaLambdaLocalRunConfigurationTest {

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Before
    fun setUp() {
        CompilerTestUtil.enableExternalCompiler()
    }

    @After
    fun tearDown() {
        CompilerTestUtil.disableExternalCompiler(projectRule.project)
    }

    @Test
    fun basicInvocationOfAJavaLambda() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")
        fixture.addClass(module, TEST_CLASS)

        val runConfiguration = createRunConfiguration()

        compileModule(module)

        val executionFuture = CompletableFuture<Output>()
        runInEdtAndWait {
            val executor = ExecutorRegistry.getInstance().getExecutorById("Run")
            val executionEnvironment = ExecutionEnvironmentBuilder.create(executor, runConfiguration).build()

            executionEnvironment.runner.execute(executionEnvironment) {
                it.processHandler?.addProcessListener(object : OutputListener() {
                    override fun processTerminated(event: ProcessEvent) {
                        super.processTerminated(event)
                        executionFuture.complete(this.output)
                    }
                })
            }
        }

        val output = executionFuture.get(10, TimeUnit.SECONDS)
        assertThat(output.exitCode, equalTo(0))
        assertThat(output.stdout, equalToIgnoringWhiteSpace("HELLO!"))
        assertThat(output.stderr, isEmptyString())
    }

    @Test
    fun regionIsPassedIn() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")
        fixture.addClass(module, TEST_CLASS)

        val runConfiguration = createRunConfiguration("com.example.UsefulUtils::printEnvVar")

        compileModule(module)

        val executionFuture = CompletableFuture<Output>()
        runInEdtAndWait {
            val executor = ExecutorRegistry.getInstance().getExecutorById("Run")
            val executionEnvironment = ExecutionEnvironmentBuilder.create(executor, runConfiguration).build()

            executionEnvironment.runner.execute(executionEnvironment) {
                it.processHandler?.addProcessListener(object : OutputListener() {
                    override fun processTerminated(event: ProcessEvent) {
                        super.processTerminated(event)
                        executionFuture.complete(this.output)
                    }
                })
            }
        }

        val output = executionFuture.get(10, TimeUnit.SECONDS)
        assertThat(output.exitCode, equalTo(0))
        assertThat(output.stdout, containsString("AWS_REGION=us-east-1"))
        assertThat(output.stdout, containsString("AWS_DEFAULT_REGION=us-east-1"))
        assertThat(output.stderr, isEmptyString())
    }

    @Test
    fun hasAnAssociatedDebugRunner() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        fixture.addClass(module, TEST_CLASS)

        val runConfiguration = createRunConfiguration()

        val debugExecutor = ExecutorRegistry.getInstance().getExecutorById("Debug")
        val runner = RunnerRegistry.getInstance().getRunner(debugExecutor.id, runConfiguration)
        assertThat(runner, notNullValue())
    }

    @Test
    fun handlerIsRenamedWhenClassRenamed() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val psiClass = fixture.addClass(module, TEST_CLASS)
        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        val runConfiguration = createRunConfiguration()

        WriteCommandAction.runWriteCommandAction(fixture.project) {
            fixture.renameElement(psiClass, "UsefulUtils2")
        }

        assertThat(runConfiguration.getHandler(), equalTo("com.example.UsefulUtils2::upperCase"))

        undo()

        assertThat(runConfiguration.getHandler(), equalTo("com.example.UsefulUtils::upperCase"))
    }

    @Test
    fun handlerIsRenamedWhenMethodRenamed() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val psiClass = fixture.addClass(module, TEST_CLASS)
        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        val runConfiguration = createRunConfiguration()

        runInEdtAndWait {
            fixture.renameElement(psiClass.findMethodsByName("upperCase", false)[0], "upperCase2")
        }

        assertThat(runConfiguration.getHandler(), equalTo("com.example.UsefulUtils::upperCase2"))

        undo()

        assertThat(runConfiguration.getHandler(), equalTo("com.example.UsefulUtils::upperCase"))
    }

    @Test
    fun handlerIsNotRenamedWhenUnrelatedRenamed() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val psiClass = fixture.addClass(module, TEST_CLASS)
        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        val runConfiguration = createRunConfiguration()

        WriteCommandAction.runWriteCommandAction(fixture.project) {
            val findFieldByName = psiClass.findFieldByName("randomField", false)!!
            fixture.renameElement(findFieldByName, "randomField2")
        }

        assertThat(runConfiguration.getHandler(), equalTo("com.example.UsefulUtils::upperCase"))

        undo()

        assertThat(runConfiguration.getHandler(), equalTo("com.example.UsefulUtils::upperCase"))
    }

    private fun undo() {
        runInEdtAndWait {
            val textEditor = TextEditorProvider.getInstance().getTextEditor(projectRule.fixture.editor)
            UndoManager.getInstance(projectRule.project).undo(textEditor)
        }
    }

    private fun createRunConfiguration(handler: String = "com.example.UsefulUtils::upperCase"): LambdaLocalRunConfiguration {
        val runManager = RunManager.getInstance(projectRule.project)
        val factory = runManager.configurationFactories.filterIsInstance<LambdaRunConfiguration>().first()
        val runConfigurationAndSettings = runManager.createRunConfiguration("Test", factory.configurationFactories.first())
        val runConfiguration = runConfigurationAndSettings.configuration as LambdaLocalRunConfiguration
        runManager.addConfiguration(runConfigurationAndSettings)

        runConfiguration.configure(
            handler = handler,
            runtime = Runtime.JAVA8,
            input = "hello!",
            region = AwsRegion("us-east-1", "N.Virginia")
        )

        return runConfiguration
    }

    private fun compileModule(module: Module) {
        setUpCompiler()
        val compileFuture = CompletableFuture<CompileContext>()
        ApplicationManager.getApplication().invokeAndWait {
            CompilerManager.getInstance(module.project).rebuild { aborted, errors, _, context ->
                if (!aborted && errors == 0) {
                    compileFuture.complete(context)
                } else {
                    compileFuture.completeExceptionally(RuntimeException("Compilation error: ${context.getMessages(CompilerMessageCategory.ERROR).map { it.message }}"))
                }
            }
        }
        compileFuture.get(30, TimeUnit.SECONDS)
    }

    private fun setUpCompiler() {
        val project = projectRule.project
        val modules = ModuleManager.getInstance(project).modules

        WriteCommandAction.writeCommandAction(project).run<Nothing> {
            val compilerExtension = CompilerProjectExtension.getInstance(project)!!
            compilerExtension.compilerOutputUrl = projectRule.fixture.tempDirFixture.findOrCreateDir("out").url
            val sdk = JavaAwareProjectJdkTableImpl.getInstanceEx().internalJdk

            for (module in modules) {
                ModuleRootModificationUtil.setModuleSdk(module, sdk)
            }
        }

        runInEdtAndWait {
            PlatformTestUtil.saveProject(project)
            CompilerTestUtil.saveApplicationSettings()
        }
    }

    private companion object {
        @Language("JAVA")
        const val TEST_CLASS = """
            package com.example;

            public class UsefulUtils {
                private String randomField = "hello";

                public static String printEnvVar(String ignored) {
                    StringBuilder builder = new StringBuilder();
                    System.getenv().forEach((k, v) -> {
                        builder.append(k).append('=').append(v).append('\n');
                    });
                    return builder.toString();
                }

                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
    }
}