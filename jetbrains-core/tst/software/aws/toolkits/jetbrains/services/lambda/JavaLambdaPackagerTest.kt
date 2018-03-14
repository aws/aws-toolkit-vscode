package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.compiler.CompilerTestUtil
import com.intellij.openapi.application.Result
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.projectRoots.impl.JavaAwareProjectJdkTableImpl
import com.intellij.openapi.roots.CompilerProjectExtension
import com.intellij.openapi.roots.DependencyScope
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.psi.PsiFile
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.PathUtil
import org.assertj.core.api.Assertions.assertThat
import org.joda.time.LocalDate
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.testutils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.testutils.rules.addClass
import software.aws.toolkits.jetbrains.testutils.rules.addModule
import software.aws.toolkits.jetbrains.testutils.rules.addResourceFile
import software.aws.toolkits.jetbrains.testutils.rules.addTestClass
import java.io.File
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.TimeUnit
import java.util.zip.ZipFile

class JavaLambdaPackagerTest {
    private val dependentJarPath = PathUtil.getJarPathForClass(LocalDate::class.java)
    private val testDependencyJarPath = PathUtil.getJarPathForClass(Test::class.java)
    private val testDependencyJarName = File(testDependencyJarPath).name
    private val dependentJarName = File(dependentJarPath).name

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    private val lambdaPackager = JavaLambdaPackager()

    @Before
    fun setUp() {
        CompilerTestUtil.enableExternalCompiler()
    }

    @After
    fun tearDown() {
        CompilerTestUtil.disableExternalCompiler(projectRule.project)
    }

    @Test
    fun canPackageASingleClassFile() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("aModule")
        val psiFile = fixture.addClass(
            module, """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        runAndVerifyExpectedEntries(module, psiFile, "com/example/UsefulUtils.class")
    }

    @Test
    fun canPackageAProjectWithDependencies() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("aModule")
        PsiTestUtil.addLibrary(module, dependentJarPath)

        val psiFile = fixture.addClass(
            module, """
            package com.example;

            import java.time.Instant;

            public class UsefulUtils {
                public static Long currentDate(String input) {
                    return Instant.now().toEpochMilli();
                }
            }
            """
        ).containingFile

        runAndVerifyExpectedEntries(module, psiFile, "com/example/UsefulUtils.class", "lib/$dependentJarName")
    }

    @Test
    fun canPackageAMultiModuleProject() {
        val fixture = projectRule.fixture
        val mainModule = fixture.addModule("main")
        val dependencyModule = fixture.addModule("dependency")
        val nonDependencyModule = fixture.addModule("nonDependency")

        val mainClass = fixture.addClass(
            mainModule, """
            package com.example;

            import com.example.dependency.SomeClass;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return SomeClass.upperCase(input);
                }
            }
            """
        ).containingFile

        fixture.addClass(
            dependencyModule,
            """package com.example.dependency;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        PsiTestUtil.addLibrary(dependencyModule, dependentJarPath)

        fixture.addClass(
            nonDependencyModule,
            """package com.example.non.dependency;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        ModuleRootModificationUtil.addDependency(mainModule, dependencyModule)

        runAndVerifyExpectedEntries(mainModule, mainClass,
            "com/example/UsefulUtils.class",
            "com/example/dependency/SomeClass.class",
            "lib/$dependentJarName")
    }

    @Test
    fun canIncludeResourceFiles() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val mainClass = fixture.addClass(
            module, """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        fixture.addResourceFile(module, "foo/bar.txt", "hello world!")

        runAndVerifyExpectedEntries(module, mainClass, "com/example/UsefulUtils.class", "foo/bar.txt")
    }

    @Test
    fun doesNotIncludeTestClassesOrDependencies() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val mainClass = fixture.addClass(
            module, """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        fixture.addTestClass(
            module, """
            package com.example;

            import org.junit.Test;

            public class UsefulUtilsTest {

                @Test
                public void canCallUpper() {
                    UsefulUtils.upperCase("blah");
                }
            }
            """
        )

        ModuleRootModificationUtil.addModuleLibrary(module, testDependencyJarName, mutableListOf(testDependencyJarPath), mutableListOf(), DependencyScope.TEST)

        runAndVerifyExpectedEntries(module, mainClass, "com/example/UsefulUtils.class")
    }

    private fun runAndVerifyExpectedEntries(module: Module, mainClass: PsiFile, vararg entries: String) {
        setUpCompiler()

        val completableFuture = CompletableFuture<Path>()

        runInEdt {
            lambdaPackager.createPackage(module, mainClass).whenDone(completableFuture)
        }

        completableFuture.thenAccept {
            assertThat(zipEntries(it)).containsExactlyInAnyOrder(*entries)
        }.get(30, TimeUnit.SECONDS)
    }

    private fun setUpCompiler() {
        val project = projectRule.project
        val modules = ModuleManager.getInstance(project).modules

        object : WriteCommandAction<Nothing>(project) {
            override fun run(result: Result<Nothing>) {
                val compilerExtension = CompilerProjectExtension.getInstance(project)!!
                compilerExtension.compilerOutputUrl = projectRule.fixture.tempDirFixture.findOrCreateDir("out").url
                val sdk = JavaAwareProjectJdkTableImpl.getInstanceEx().internalJdk

                for (module in modules) {
                    ModuleRootModificationUtil.setModuleSdk(module, sdk)
                }
            }
        }.execute()

        runInEdtAndWait {
            PlatformTestUtil.saveProject(project)
            CompilerTestUtil.saveApplicationSettings()
        }
    }

    private fun zipEntries(zipFile: Path): List<String> = ZipFile(zipFile.toFile()).use { zip ->
        zip.entries().toList().filterNot { it.isDirectory }.mapNotNull { it.name }
    }

    private fun <T> CompletionStage<T>.whenDone(other: CompletableFuture<T>) = whenComplete { result, exception ->
        when {
            result != null -> other.complete(result)
            exception != null -> other.completeExceptionally(exception)
        }
    }
}