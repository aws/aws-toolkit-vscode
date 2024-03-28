// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.ide.highlighter.JavaFileType
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.module.JavaModuleType
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.PsiJavaFile
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.DefaultLightProjectDescriptor
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.fixtures.JavaCodeInsightTestFixture
import com.intellij.testFramework.fixtures.JavaTestFixtureFactory
import com.intellij.testFramework.fixtures.impl.LightTempDirTestFixtureImpl
import com.intellij.testFramework.runInEdtAndWait
import org.intellij.lang.annotations.Language
import org.jetbrains.jps.model.java.JavaResourceRootType
import org.jetbrains.jps.model.java.JavaSourceRootType
import org.jetbrains.jps.model.module.JpsModuleSourceRootType
import java.io.File
import java.nio.file.Paths

/**
 * JUnit test Rule that will create a Light [Project] and [JavaCodeInsightTestFixture]. Projects are lazily created
 * and are torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
class JavaCodeInsightTestFixtureRule(testDescription: DefaultLightProjectDescriptor = DefaultLightProjectDescriptor()) :
    CodeInsightTestFixtureRule(testDescription) {

    override fun createTestFixture(): CodeInsightTestFixture {
        val fixtureBuilder = IdeaTestFixtureFactory.getFixtureFactory().createLightFixtureBuilder(testDescription, testName)
        val newFixture = JavaTestFixtureFactory.getFixtureFactory()
            .createCodeInsightFixture(fixtureBuilder.fixture, LightTempDirTestFixtureImpl(true))
        newFixture.setUp()
        newFixture.testDataPath = testDataPath
        return newFixture
    }

    override val fixture: JavaCodeInsightTestFixture
        get() = lazyFixture.value as JavaCodeInsightTestFixture
}

/**
 * JUnit test Rule that will create a Heavy [Project] and [JavaCodeInsightTestFixture]. Projects are lazily created
 * and are torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
class HeavyJavaCodeInsightTestFixtureRule : CodeInsightTestFixtureRule() {
    override fun createTestFixture(): CodeInsightTestFixture {
        val fixtureBuilder = IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder(testName)
        val newFixture = JavaTestFixtureFactory.getFixtureFactory().createCodeInsightFixture(fixtureBuilder.fixture)
        newFixture.setUp()
        newFixture.testDataPath = testDataPath
        return newFixture
    }

    override val fixture: JavaCodeInsightTestFixture
        get() = lazyFixture.value as JavaCodeInsightTestFixture
}

/**
 * Add a JDK1.8 module named [moduleName] to the test fixture project with 'src', 'src-resources' and 'tst roots setup.
 * @return the created [Module]
 */
fun JavaCodeInsightTestFixture.addModule(moduleName: String): Module {
    val root = this.tempDirFixture.findOrCreateDir(moduleName)
    val module = PsiTestUtil.addModule(project, JavaModuleType.getModuleType(), moduleName, root)
    PsiTestUtil.removeAllRoots(module, IdeaTestUtil.getMockJdk18())
    runInEdtAndWait {
        WriteAction.run<Exception> {
            PsiTestUtil.addContentRoot(module, root)
            PsiTestUtil.addSourceRoot(module, createChildDirectories(root, "src/main/java"), false)
            PsiTestUtil.addSourceRoot(
                module,
                createChildDirectories(root, "src/main/resources"),
                JavaResourceRootType.RESOURCE
            )
            PsiTestUtil.addSourceRoot(module, createChildDirectories(root, "tst/main/java"), true)
        }
    }
    return module
}

private fun createChildDirectories(root: VirtualFile, path: String): VirtualFile {
    var parent = root
    path.split("/").forEach {
        val childDirectory = parent.findChild(it) ?: parent.createChildDirectory(null, it)
        parent = childDirectory
    }

    return parent
}

fun JavaCodeInsightTestFixture.openClass(@Language("JAVA") javaClass: String): PsiClass {
    val psiClass = this.addClass(javaClass)
    runInEdtAndWait {
        this.openFileInEditor(psiClass.containingFile.virtualFile)
    }
    return psiClass
}

/**
 * Add a Java class to the given [module] in the [JavaSourceRootType.SOURCE] root at the in the appropriate directory
 * determined by the definition in the [classText] content.
 *
 * @see JavaCodeInsightTestFixture.addClass
 */
fun JavaCodeInsightTestFixture.addClass(module: Module, @Language("JAVA") classText: String): PsiClass {
    val qName = determineQualifiedName(module.project, classText)
    val fileName = qName.replace('.', File.separatorChar) + ".java"
    val psiFile = addFile(module, JavaSourceRootType.SOURCE, fileName, classText) as PsiJavaFile
    return ReadAction.compute<PsiClass, RuntimeException> { psiFile.classes[0] }
}

/**
 * Add a Java test class to the given [module] in the [JavaSourceRootType.TEST_SOURCE] root at the in the appropriate directory
 * determined by the definition in the [classText] content.
 *
 * @see JavaCodeInsightTestFixture.addClass
 */
fun JavaCodeInsightTestFixture.addTestClass(module: Module, @Language("JAVA") classText: String): PsiClass {
    val qName = determineQualifiedName(module.project, classText)
    val fileName = qName.replace('.', File.separatorChar) + ".java"
    val psiFile = addFile(module, JavaSourceRootType.TEST_SOURCE, fileName, classText) as PsiJavaFile
    return ReadAction.compute<PsiClass, RuntimeException> { psiFile.classes[0] }
}

/**
 * Add a resource file to the given [module] in the [JavaResourceRootType.RESOURCE] root at the path specified in [fileName]
 * with [content].
 */
fun JavaCodeInsightTestFixture.addResourceFile(module: Module, fileName: String, content: String): PsiFile =
    addFile(module, JavaResourceRootType.RESOURCE, fileName, content)

private fun JavaCodeInsightTestFixture.addFile(
    module: Module,
    type: JpsModuleSourceRootType<*>,
    fileName: String,
    content: String
): PsiFile {
    val sourceRoot = ModuleRootManager.getInstance(module).getSourceRoots(type).first()
    val fullPath = Paths.get(sourceRoot.path, fileName).toString()
    val projectRelativePath = FileUtil.getRelativePath(tempDirPath, fullPath, File.separatorChar)
        ?: throw RuntimeException("Cannot determine relative path")
    return addFileToProject(projectRelativePath.replace('\\', '/'), content)
}

private fun determineQualifiedName(project: Project, classText: String): String =
    ReadAction.compute<String, RuntimeException> {
        val factory = PsiFileFactory.getInstance(project)
        val javaFile = factory.createFileFromText("a.java", JavaFileType.INSTANCE, classText) as PsiJavaFile
        javaFile.classes[0].qualifiedName
    } ?: throw RuntimeException("Cannot determine fully qualified name")
