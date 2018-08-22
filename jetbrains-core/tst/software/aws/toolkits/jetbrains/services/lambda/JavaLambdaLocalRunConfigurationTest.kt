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
import com.intellij.openapi.compiler.CompileContext
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.compiler.CompilerMessageCategory
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.projectRoots.impl.JavaAwareProjectJdkTableImpl
import com.intellij.openapi.roots.CompilerProjectExtension
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.equalToIgnoringWhiteSpace
import org.hamcrest.Matchers.isEmptyString
import org.hamcrest.Matchers.notNullValue
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
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

        fixture.addClass(
            module, """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        val runManager = RunManager.getInstance(projectRule.project)
        val factory = runManager.configurationFactories.filterIsInstance<LambdaRunConfiguration>().first()
        val runConfigurationAndSettings = runManager.createRunConfiguration("Test", factory.configurationFactories.first())
        val runConfiguration = runConfigurationAndSettings.configuration as LambdaLocalRunConfiguration

        runConfiguration.configure(handler = "com.example.UsefulUtils::upperCase", runtime = Runtime.JAVA8, input = "hello!")

        compileModule(module)

        val executionFuture = CompletableFuture<Output>()
        runInEdtAndWait {
            val executionEnvironment =
                ExecutionEnvironmentBuilder.create(ExecutorRegistry.getInstance().getExecutorById("Run"), runConfigurationAndSettings).build()

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
    fun hasAnAssociatedDebugRunner() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        fixture.addClass(
            module, """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        val runManager = RunManager.getInstance(projectRule.project)
        val factory = runManager.configurationFactories.filterIsInstance<LambdaRunConfiguration>().first()
        val runConfigurationAndSettings = runManager.createRunConfiguration("Test", factory.configurationFactories.first())
        val runConfiguration = runConfigurationAndSettings.configuration as LambdaLocalRunConfiguration

        runConfiguration.configure(handler = "com.example.UsefulUtils::upperCase", runtime = Runtime.JAVA8, input = "hello!")

        val debugExecutor = ExecutorRegistry.getInstance().getExecutorById("Debug")
        val runner = RunnerRegistry.getInstance().getRunner(debugExecutor.getId(), runConfiguration)
        assertThat(runner, notNullValue())
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
}