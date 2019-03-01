// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.fasterxml.jackson.annotation.JacksonAnnotation
import com.intellij.compiler.CompilerTestUtil
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.command.WriteCommandAction.writeCommandAction
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.projectRoots.impl.JavaAwareProjectJdkTableImpl
import com.intellij.openapi.roots.CompilerProjectExtension
import com.intellij.openapi.roots.DependencyScope
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.PathUtil
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.rules.addResourceFile
import software.aws.toolkits.jetbrains.utils.rules.addTestClass
import java.io.File
import java.nio.file.Paths

class JavaLambdaBuilderTest : BaseLambdaBuilderTest() {
    private val dependentJarPath = PathUtil.getJarPathForClass(JacksonAnnotation::class.java)
    private val testDependencyJarPath = PathUtil.getJarPathForClass(Test::class.java)
    private val testDependencyJarName = File(testDependencyJarPath).name
    private val dependentJarName = File(dependentJarPath).name

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    override val lambdaBuilder: LambdaBuilder
        get() = JavaLambdaBuilder()

    @Before
    override fun setUp() {
        super.setUp()
        CompilerTestUtil.enableExternalCompiler()
    }

    @After
    fun tearDown() {
        CompilerTestUtil.disableExternalCompiler(projectRule.project)
    }

    @Test
    fun canBuildASingleClassFile() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("aModule")
        val handlerClass = fixture.addClass(
            module,
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        setUpCompiler()

        val builtLambda = buildLambda(module, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class"
        )
    }

    @Test
    fun canBuildAProjectWithDependencies() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("aModule")
        PsiTestUtil.addLibrary(module, dependentJarPath)

        val handlerClass = fixture.addClass(
            module,
            """
            package com.example;

            import java.time.Instant;

            public class UsefulUtils {
                public static Long currentDate(String input) {
                    return Instant.now().toEpochMilli();
                }
            }
            """
        ).containingFile

        setUpCompiler()

        val builtLambda = buildLambda(module, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class",
            "lib/$dependentJarName"
        )
    }

    @Test
    fun canBuildAMultiModuleProject() {
        val fixture = projectRule.fixture
        val mainModule = fixture.addModule("main")
        val dependencyModule = fixture.addModule("dependency")
        val nonDependencyModule = fixture.addModule("nonDependency")

        val handlerClass = fixture.addClass(
            mainModule,
            """
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
            """
            package com.example.dependency;

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
            """
            package com.example.non.dependency;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        ModuleRootModificationUtil.addDependency(mainModule, dependencyModule)

        setUpCompiler()

        val builtLambda = buildLambda(mainModule, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class",
            "com/example/dependency/SomeClass.class",
            "lib/$dependentJarName"
        )
    }

    @Test
    fun canIncludeResourceFiles() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val handlerClass = fixture.addClass(
            module,
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        fixture.addResourceFile(module, "foo/bar.txt", "hello world!")

        setUpCompiler()

        val builtLambda = buildLambda(module, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class",
            "foo/bar.txt"
        )
    }

    @Test
    fun doesNotIncludeTestClassesOrDependencies() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val handlerClass = fixture.addClass(
            module,
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        fixture.addTestClass(
            module,
            """
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

        ModuleRootModificationUtil.addModuleLibrary(
            module,
            testDependencyJarName,
            mutableListOf(testDependencyJarPath),
            mutableListOf(),
            DependencyScope.TEST
        )

        setUpCompiler()

        val builtLambda = buildLambda(module, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class"
        )
    }

    @Test
    fun canBuildFromATemplate() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("aModule")
        fixture.addClass(
            module,
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        ).containingFile

        val templateFile = projectRule.fixture.addFileToProject(
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: com.example.UsefulUtils
                  CodeUri: aModule
                  Runtime: java8
                  Timeout: 900
            """.trimIndent()
        )
        val templatePath = Paths.get(templateFile.virtualFile.path)

        setUpCompiler()

        val builtLambda = buildLambdaFromTemplate(module, templatePath, "SomeFunction")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class"
        )
    }

    @Test
    fun canPackageAMultiModuleProject() {
        val fixture = projectRule.fixture
        val mainModule = fixture.addModule("main")
        val dependencyModule = fixture.addModule("dependency")
        val nonDependencyModule = fixture.addModule("nonDependency")

        val handlerClass = fixture.addClass(
            mainModule,
            """
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
            """
            package com.example.dependency;

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
            """
            package com.example.non.dependency;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        ModuleRootModificationUtil.addDependency(mainModule, dependencyModule)

        setUpCompiler()

        val lambdaPackage = packageLambda(mainModule, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyZipEntries(
            lambdaPackage,
            "com/example/UsefulUtils.class",
            "com/example/dependency/SomeClass.class",
            "lib/$dependentJarName"
        )
    }

    @Test
    fun packagedFilesHaveNoLock() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")

        val handlerClass = fixture.addClass(
            module,
            """
            package com.example;

            public class UsefulUtils {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        ModuleRootModificationUtil.addModuleLibrary(
            module,
            testDependencyJarName,
            mutableListOf(testDependencyJarPath),
            mutableListOf(),
            DependencyScope.TEST
        )

        setUpCompiler()

        val builtLambda = buildLambda(module, handlerClass, Runtime.JAVA8, "com.example.UsefulUtils")
        verifyEntries(
            builtLambda,
            "com/example/UsefulUtils.class"
        )

        runInEdt {
            // Modify the file that was compiled to verify there is no lock remaining
            fixture.renameElement(
                handlerClass.findMethodsByName("upperCase", false)[0],
                "foo"
            )
        }
    }

    private fun setUpCompiler() {
        val project = projectRule.project
        val modules = ModuleManager.getInstance(project).modules

        writeCommandAction(project).run<Nothing> {
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