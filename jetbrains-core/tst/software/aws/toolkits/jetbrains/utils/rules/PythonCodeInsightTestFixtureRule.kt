// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.ide.util.projectWizard.EmptyModuleBuilder
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.module.ModuleTypeManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.impl.ProjectJdkImpl
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.builders.ModuleFixtureBuilder
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.IdeaProjectTestFixture
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.testFramework.fixtures.ModuleFixture
import com.intellij.testFramework.fixtures.TestFixtureBuilder
import com.intellij.testFramework.fixtures.impl.ModuleFixtureBuilderImpl
import com.intellij.testFramework.fixtures.impl.ModuleFixtureImpl
import com.jetbrains.python.PythonModuleTypeBase
import com.jetbrains.python.sdk.PythonSdkAdditionalData
import com.jetbrains.python.sdk.PythonSdkType
import com.jetbrains.python.sdk.flavors.CPythonSdkFlavor
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.annotations.NotNull
import java.io.File
import java.nio.file.Paths

/**
 * JUnit test Rule that will create a Light [Project] and [CodeInsightTestFixture] with Python support. Projects are
 * lazily created and are torn down after each test.
 *
 * If you wish to have just a [Project], you may use Intellij's [com.intellij.testFramework.ProjectRule]
 */
class PythonCodeInsightTestFixtureRule : CodeInsightTestFixtureRule() {
    override fun createTestFixture(): CodeInsightTestFixture {
        val fixtureFactory = IdeaTestFixtureFactory.getFixtureFactory()
        fixtureFactory.registerFixtureBuilder(
            PythonModuleFixtureBuilder::class.java,
            PythonModuleFixtureBuilder::class.java
        )
        val fixtureBuilder = fixtureFactory.createFixtureBuilder(testName)
        fixtureBuilder.addModule(PythonModuleFixtureBuilder::class.java)
        val newFixture = fixtureFactory.createCodeInsightFixture(fixtureBuilder.fixture)
        newFixture.testDataPath = testDataPath
        newFixture.setUp()

        val module = newFixture.module

        val projectRoot = newFixture.tempDirFixture.getFile(".")
        val mainContent = newFixture.tempDirFixture.findOrCreateDir("main")
        val testContent = newFixture.tempDirFixture.findOrCreateDir("test")
        PsiTestUtil.addSourceRoot(module, projectRoot)
        PsiTestUtil.addContentRoot(module, mainContent)
        PsiTestUtil.addSourceRoot(module, testContent, true)

        ModuleRootModificationUtil.setModuleSdk(module, PyTestSdk3x())

        return newFixture
    }

    override val fixture: CodeInsightTestFixture
        get() = lazyFixture.value
}

internal class PythonModuleFixtureBuilder(fixtureBuilder: TestFixtureBuilder<out IdeaProjectTestFixture>) :
    ModuleFixtureBuilderImpl<ModuleFixture>(PlatformPythonModuleType(), fixtureBuilder),
    ModuleFixtureBuilder<ModuleFixture> {

    override fun instantiateFixture(): ModuleFixture = ModuleFixtureImpl(this)
}

internal class PlatformPythonModuleType : PythonModuleTypeBase<EmptyModuleBuilder>() {
    override fun createModuleBuilder(): EmptyModuleBuilder = object : EmptyModuleBuilder() {
        override fun getModuleType(): ModuleType<EmptyModuleBuilder> = instance
    }

    companion object {
        val instance: PlatformPythonModuleType
            get() = ModuleTypeManager.getInstance().findByID(PYTHON_MODULE) as PlatformPythonModuleType
    }
}

class PyTestSdk2x : PyTestSdk("PyTestSdk2x") {
    override fun getVersionString(): String? = "FakeCPython 2.6.0"
}

class PyTestSdk3x : PyTestSdk("PyTestSdk3x") {
    override fun getVersionString(): String? = "FakeCPython 3.7.0"
}

class PyVirtualEnvSdk(module: Module) : PyTestSdk("PyVirtEnv") {
    private val envHome = Paths.get(ModuleRootManager.getInstance(module).contentRoots[0].path, "venv")
    private val pythonExecutable = envHome.resolve(Paths.get("bin", "python"))
    private val envSitePackages = envHome.resolve("lib").resolve("site-packages")

    init {
        Disposer.register(module, this)

        createFileIfNotExists(pythonExecutable.toFile())
        createFileIfNotExists(envHome.resolve("pyvenv.cfg").toFile())
        createDirIfNotExists(envSitePackages.toFile())

        addRoot(LocalFileSystem.getInstance().findFileByIoFile(envSitePackages.toFile())!!, OrderRootType.CLASSES)

        homePath = pythonExecutable.toString()
    }

    override fun getVersionString(): String? = "FakeCPython 3.7.0 [virtual-env]"

    fun addSitePackage(libName: String) {
        assertThat(createFileIfNotExists(envSitePackages.resolve(libName).resolve("__init__.py").toFile()))
            .isTrue()
    }

    private fun createFileIfNotExists(file: File) = createDirIfNotExists(file.parentFile) && FileUtil.createIfNotExists(file).also {
        LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
    }

    private fun createDirIfNotExists(dir: File) = FileUtil.createDirectory(dir).also {
        LocalFileSystem.getInstance().refreshAndFindFileByIoFile(dir)
    }
}

abstract class PyTestSdk(name: String) : ProjectJdkImpl(name, PythonSdkType.getInstance()) {
    init {
        sdkAdditionalData = PythonSdkAdditionalData(FakeCPython())
    }
}

internal class FakeCPython : CPythonSdkFlavor() {
    @NotNull
    override fun getName(): String = "FakeCPython"
}