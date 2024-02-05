// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.application.runWriteActionAndWait
import com.intellij.openapi.externalSystem.importing.ImportSpecBuilder
import com.intellij.openapi.externalSystem.model.DataNode
import com.intellij.openapi.externalSystem.model.project.ProjectData
import com.intellij.openapi.externalSystem.service.execution.ProgressExecutionMode
import com.intellij.openapi.externalSystem.service.project.ExternalProjectRefreshCallback
import com.intellij.openapi.externalSystem.service.project.ProjectDataManager
import com.intellij.openapi.externalSystem.settings.ExternalSystemSettingsListener
import com.intellij.openapi.externalSystem.util.ExternalSystemApiUtil
import com.intellij.openapi.externalSystem.util.ExternalSystemUtil
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.projectRoots.impl.JavaAwareProjectJdkTableImpl
import com.intellij.openapi.projectRoots.impl.SdkConfigurationUtil
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Ref
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiJavaFile
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.RunAll
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.xdebugger.XDebuggerUtil
import org.jetbrains.idea.maven.model.MavenExplicitProfiles
import org.jetbrains.idea.maven.project.MavenProjectsManager
import org.jetbrains.idea.maven.server.MavenServerManager
import org.jetbrains.idea.maven.utils.MavenProgressIndicator.MavenProgressTracker
import org.jetbrains.plugins.gradle.settings.GradleProjectSettings
import org.jetbrains.plugins.gradle.util.GradleConstants
import org.junit.Assert.fail
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.isDirectory

fun HeavyJavaCodeInsightTestFixtureRule.setUpJdk(jdkName: String = "Real JDK"): String {
    val jdkHome = IdeaTestUtil.requireRealJdkHome()

    runInEdtAndWait {
        runWriteAction {
            VfsRootAccess.allowRootAccess(this.fixture.testRootDisposable, jdkHome)
            val jdkHomeDir = LocalFileSystem.getInstance().refreshAndFindFileByPath(jdkHome)!!
            val jdk = SdkConfigurationUtil.setupSdk(emptyArray(), jdkHomeDir, JavaSdk.getInstance(), false, null, jdkName)!!

            ProjectJdkTable.getInstance().addJdk(jdk, this.fixture.testRootDisposable)
            ModuleRootModificationUtil.setModuleSdk(this.module, jdk)
        }
    }

    return jdkHome
}

fun HeavyJavaCodeInsightTestFixtureRule.setUpGradleProject(compatibility: String = "1.8"): PsiClass {
    val fixture = this.fixture
    val buildFile = fixture.addFileToModule(
        this.module,
        "build.gradle",
        """
            plugins {
                id 'java'
            }

            sourceCompatibility = '$compatibility'
            targetCompatibility = '$compatibility'
        """.trimIndent()
    ).virtualFile

    // Use our project's own Gradle version
    this.copyGradleFiles()

    val lambdaClass = fixture.addClass(
        """
            package com.example;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
        """.trimIndent()
    )

    val jdkName = "Gradle JDK"
    setUpJdk(jdkName)

    ExternalSystemApiUtil.subscribe(
        project,
        GradleConstants.SYSTEM_ID,
        object : ExternalSystemSettingsListener<GradleProjectSettings> {
            override fun onProjectsLinked(settings: Collection<GradleProjectSettings>) {
                super.onProjectsLinked(settings)
                settings.first().gradleJvm = jdkName
            }
        }
    )

    val gradleProjectSettings = GradleProjectSettings().apply {
        withQualifiedModuleNames()
        externalProjectPath = buildFile.path
    }

    val externalSystemSettings = ExternalSystemApiUtil.getSettings(project, GradleConstants.SYSTEM_ID)
    externalSystemSettings.setLinkedProjectsSettings(setOf(gradleProjectSettings))

    val error = Ref.create<String>()

    val refreshCallback = object : ExternalProjectRefreshCallback {
        override fun onSuccess(externalProject: DataNode<ProjectData>?) {
            if (externalProject == null) {
                System.err.println("Got null External project after import")
                return
            }
            ProjectDataManager.getInstance().importData(externalProject, project, true)
            println("External project was successfully imported")
        }

        override fun onFailure(errorMessage: String, errorDetails: String?) {
            error.set(errorMessage)
        }
    }

    val importSpecBuilder = ImportSpecBuilder(project, GradleConstants.SYSTEM_ID)
        .callback(refreshCallback)
        .use(ProgressExecutionMode.MODAL_SYNC)

    ExternalSystemUtil.refreshProjects(importSpecBuilder)

    if (!error.isNull) {
        fail("Import failed: " + error.get())
    }

    return lambdaClass
}

fun HeavyJavaCodeInsightTestFixtureRule.addBreakpoint() {
    runInEdtAndWait {
        val document = fixture.editor.document
        val psiFile = fixture.file as PsiJavaFile
        val body = psiFile.classes[0].allMethods[0].body!!.statements[0]
        val lineNumber = document.getLineNumber(body.textOffset)

        XDebuggerUtil.getInstance().toggleLineBreakpoint(
            project,
            fixture.file.virtualFile,
            lineNumber
        )
    }
}

private fun HeavyJavaCodeInsightTestFixtureRule.copyGradleFiles() {
    val gradleRoot = findGradlew()
    val gradleFiles = setOf("gradle/wrapper", "gradlew.bat", "gradlew")

    gradleFiles.forEach {
        val gradleFile = gradleRoot.resolve(it)
        if (gradleFile.exists()) {
            copyPath(gradleRoot, gradleFile)
        } else {
            throw IllegalStateException("Failed to locate $it")
        }
    }
}

private fun HeavyJavaCodeInsightTestFixtureRule.copyPath(root: Path, path: Path) {
    if (path.isDirectory()) {
        Files.list(path).forEach {
            // Skip over files like .DS_Store. No gradlew related files start with a "." so safe to skip
            if (it.fileName.toString().startsWith(".")) {
                return@forEach
            }
            this@copyPath.copyPath(root, it)
        }
    } else {
        fixture.addFileToModule(module, root.relativize(path).toString(), "").also { newFile ->
            runInEdtAndWait {
                runWriteAction {
                    newFile.virtualFile.getOutputStream(null).use { out ->
                        path.inputStream().use { it.copyTo(out) }
                    }
                }
            }
            if (SystemInfo.isUnix) {
                val newPath = Paths.get(newFile.virtualFile.path)
                Files.setPosixFilePermissions(newPath, Files.getPosixFilePermissions(path))
            }
        }
    }
}

private fun findGradlew(): Path {
    var root = Paths.get("").toAbsolutePath()
    while (root.parent != null) {
        if (root.resolve("gradlew").exists()) {
            return root
        } else {
            root = root.parent
        }
    }

    throw IllegalStateException("Failed to locate gradlew")
}

internal suspend fun HeavyJavaCodeInsightTestFixtureRule.setUpMavenProject(): PsiClass {
    val fixture = this.fixture
    val pomFile = fixture.addFileToModule(
        this.module,
        "pom.xml",
        """
            <project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/maven-v4_0_0.xsd">
                <modelVersion>4.0.0</modelVersion>
                <groupId>helloworld</groupId>
                <artifactId>HelloWorld</artifactId>
                <version>1.0</version>
                <packaging>jar</packaging>
                <name>A sample Hello World created for SAM CLI.</name>
                <properties>
                    <maven.compiler.source>1.8</maven.compiler.source>
                    <maven.compiler.target>1.8</maven.compiler.target>
                </properties>
            </project>
        """.trimIndent()
    ).virtualFile

    val lambdaClass = fixture.addClass(
        """
            package com.example;

            public class SomeClass {
                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
        """.trimIndent()
    )

    Disposer.register(this.fixture.testRootDisposable) {
        RunAll.runAll(
            { runWriteActionAndWait { JavaAwareProjectJdkTableImpl.removeInternalJdkInTests() } },
            // unsure why we can't let connectors be closed automatically during disposer cleanup
            { Disposer.dispose(MavenServerManager.getInstance()) }
        )
    }

    val projectsManager = MavenProjectsManager.getInstance(project)
    projectsManager.initForTests()

    val poms = listOf(pomFile)
    projectsManager.addManagedFilesWithProfilesAndUpdate(poms, MavenExplicitProfiles.NONE, null, null)

    runInEdtAndWait {
        project.getServiceIfCreated(MavenProgressTracker::class.java)?.waitForProgressCompletion()
        projectsManager.importProjects()
    }

    return lambdaClass
}
