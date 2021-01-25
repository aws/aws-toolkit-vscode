// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.sdk

import org.gradle.api.DefaultTask
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.plugins.JavaPlugin
import org.gradle.api.plugins.JavaPluginConvention
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.SourceSet
import org.gradle.api.tasks.TaskAction
import org.gradle.plugins.ide.idea.model.IdeaModel
import software.amazon.awssdk.codegen.C2jModels
import software.amazon.awssdk.codegen.CodeGenerator
import software.amazon.awssdk.codegen.model.config.customization.CustomizationConfig
import software.amazon.awssdk.codegen.model.service.ServiceModel
import software.amazon.awssdk.codegen.utils.ModelLoaderUtils
import java.io.File

open class GenerateSdkExtension(project: Project) {
    val c2jFolder: DirectoryProperty = project.objects.directoryProperty()

    val outputDir: DirectoryProperty = project.objects.directoryProperty()

    fun srcDir() = outputDir.dir("src")
    fun tsDir() = outputDir.dir("tst")
}

@Suppress("unused") // Plugin is created by buildSrc/build.gradle.kts
class GenerateSdkPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        project.pluginManager.apply(JavaPlugin::class.java)

        val extension = project.extensions.create("sdkGenerator", GenerateSdkExtension::class.java, project)
        extension.c2jFolder.convention(project.layout.projectDirectory.dir("codegen-resources"))
        extension.outputDir.convention(project.layout.buildDirectory.dir("generated-sources"))

        val generateSdkTask = project.tasks.create("generateSdk", GenerateSdk::class.java)

        val javaConvention = project.convention.getPlugin(JavaPluginConvention::class.java)
        val mainSourceSet = javaConvention.sourceSets.getByName(SourceSet.MAIN_SOURCE_SET_NAME)
        mainSourceSet.java.srcDir(generateSdkTask.srcDir)
        project.tasks.getByName(mainSourceSet.compileJavaTaskName).dependsOn(generateSdkTask)

        val ideaModel = project.extensions.getByType(IdeaModel::class.java)
        ideaModel.module.generatedSourceDirs.add(generateSdkTask.srcDir.get().asFile)
    }
}

open class GenerateSdk : DefaultTask() {
    @InputDirectory
    val c2jFolder: DirectoryProperty = project.objects.directoryProperty().convention(project.extensions.getByType(GenerateSdkExtension::class.java).c2jFolder)

    @OutputDirectory
    val srcDir: DirectoryProperty = project.objects.directoryProperty().convention(project.extensions.getByType(GenerateSdkExtension::class.java).srcDir())

    @Internal
    val testDir: DirectoryProperty = project.objects.directoryProperty().convention(project.extensions.getByType(GenerateSdkExtension::class.java).tsDir())

    @TaskAction
    fun generate() {
        val srcDir = srcDir.asFile.get()
        val testDir = testDir.asFile.get()
        srcDir.deleteRecursively()
        testDir.deleteRecursively()

        c2jFolder.get().asFileTree.visit {
            if (isDirectory) {
                with(file) {
                    logger.info("Generating SDK from $this")
                    val models = C2jModels.builder()
                        .serviceModel(loadServiceModel())
                        .paginatorsModel(loadOptionalModel("paginators-1.json"))
                        .customizationConfig(loadOptionalModel("customization.config") ?: CustomizationConfig.create())
                        .waitersModel(loadOptionalModel("waiters-2.json"))
                        .build()

                    CodeGenerator.builder()
                        .models(models)
                        .sourcesDirectory(srcDir.absolutePath)
                        .testsDirectory(testDir.absolutePath)
                        .build()
                        .execute()
                }
            }
        }
    }

    private fun File.loadServiceModel(): ServiceModel? = ModelLoaderUtils.loadModel(ServiceModel::class.java, resolve("service-2.json"))

    private inline fun <reified T> File.loadOptionalModel(fileName: String): T? = resolve(fileName).takeIf { it.exists() }?.let {
        ModelLoaderUtils.loadModel(T::class.java, it)
    }
}
